"""Exercise financial row locks using separate PostgreSQL connections."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from threading import Barrier

import pytest
from django.db import connection, connections

from apps.billing.models import DiscountRedemption, Invoice
from apps.billing.services import generate_invoice, run_due_billing
from apps.catalog.models import Discount
from apps.core.exceptions import DomainError
from apps.payments.models import Payment
from apps.payments.services import record_payment
from apps.subscriptions.models import Subscription

pytestmark = pytest.mark.django_db(transaction=True)
TODAY = date(2026, 1, 1)


def race(table, operations):
    """Meet at the target SELECT FOR UPDATE, with one connection per worker."""
    if connection.vendor != "postgresql":
        pytest.skip("PostgreSQL is required to exercise row locks")
    barrier = Barrier(2, timeout=15)

    def worker(operation):
        db = connections["default"]
        met = False

        def synchronize(execute, sql, params, many, context):
            nonlocal met
            if not met and table in sql.lower() and "for update" in sql.lower():
                met = True
                barrier.wait()
            return execute(sql, params, many, context)

        try:
            with db.execute_wrapper(synchronize):
                result = operation()
            assert met, f"No locking query found for {table}"
            return result
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker, operation) for operation in operations]
        return [future.result(timeout=30) for future in futures]


def test_simultaneous_billing_runs_bill_each_period_once(subscription):
    results = race(
        "subscriptions_subscription",
        [lambda: run_due_billing(TODAY), lambda: run_due_billing(TODAY)],
    )
    assert sum(result["invoiced"] for result in results) == 1
    assert list(Invoice.objects.values_list("subscription_id", "period_start")) == [
        (subscription.pk, TODAY)
    ]


def test_concurrent_invoices_share_one_remaining_discount(subscription):
    other = Subscription.objects.create(
        number="SUB/2026/00002",
        customer=subscription.customer,
        plan=subscription.plan,
        payment_term=subscription.payment_term,
        status="active",
        start_date=TODAY,
        next_invoice_date=TODAY,
    )
    discount = Discount.objects.create(
        name="Last use", discount_type="fixed", value=10, start_date=TODAY, usage_limit=1
    )
    race(
        "catalog_discount",
        [
            lambda: generate_invoice(subscription.pk, TODAY),
            lambda: generate_invoice(other.pk, TODAY),
        ],
    )
    assert Invoice.objects.count() == 2
    assert DiscountRedemption.objects.filter(discount=discount).count() == 1
    assert sorted(Invoice.objects.values_list("discount_total", flat=True)) == [
        Decimal("0.00"),
        Decimal("10.00"),
    ]


def test_concurrent_payments_cannot_exceed_balance(subscription):
    invoice = generate_invoice(subscription.pk, TODAY)
    invoice.status = "confirmed"
    invoice.save(update_fields=["status"])

    def pay():
        try:
            record_payment(
                invoice_id=invoice.pk, amount=Decimal("60.00"), method="upi", payment_date=TODAY
            )
            return "success"
        except DomainError as exc:
            return exc.code

    assert sorted(race("billing_invoice", [pay, pay])) == ["overpayment", "success"]
    invoice.refresh_from_db()
    assert invoice.amount_paid == Decimal("60.00")
    assert invoice.amount_paid <= invoice.total
    assert Payment.objects.filter(invoice=invoice).count() == 1
