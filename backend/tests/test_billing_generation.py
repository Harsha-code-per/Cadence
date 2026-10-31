from datetime import date
from decimal import Decimal

import pytest

from apps.billing.models import DiscountRedemption, Invoice
from apps.billing.services import generate_invoice, period_end
from apps.catalog.models import Discount, Product, Tax
from apps.subscriptions.models import SubscriptionLine


@pytest.mark.django_db
def test_invoice_snapshots_discount_tax_and_idempotency(subscription):
    tax = Tax.objects.create(name="GST", rate=Decimal("18.00"))
    product = Product.objects.create(name="Support", sales_price=Decimal("10.05"), cost_price=0)
    line = SubscriptionLine.objects.create(
        subscription=subscription, product=product, quantity=2, unit_price=Decimal("10.05")
    )
    line.taxes.add(tax)
    discount = Discount.objects.create(
        name="Ten percent",
        discount_type="percent",
        value=10,
        min_amount=0,
        start_date=date(2026, 1, 1),
    )
    subscription.discount = discount
    subscription.save()
    invoice = generate_invoice(subscription.pk, date(2026, 1, 1))
    assert (invoice.subtotal, invoice.discount_total, invoice.tax_total, invoice.total) == (
        Decimal("120.10"),
        Decimal("12.01"),
        Decimal("3.26"),
        Decimal("111.35"),
    )
    assert invoice.lines.count() == 2
    assert invoice.lines.get(product=product).taxes.get().name == "GST"
    assert DiscountRedemption.objects.filter(invoice=invoice).count() == 1
    assert generate_invoice(subscription.pk, date(2026, 1, 1)) is None
    assert Invoice.objects.count() == 1


@pytest.mark.django_db
def test_expired_discount_and_month_end(subscription):
    discount = Discount.objects.create(
        name="Expired",
        discount_type="fixed",
        value=50,
        min_amount=0,
        start_date=date(2025, 1, 1),
        end_date=date(2025, 12, 31),
    )
    subscription.discount = discount
    subscription.start_date = date(2026, 1, 31)
    subscription.next_invoice_date = date(2026, 1, 31)
    subscription.save()
    invoice = generate_invoice(subscription.pk, date(2026, 1, 31))
    assert invoice.discount_total == 0
    assert invoice.period_end == date(2026, 2, 27)
    assert period_end(date(2024, 1, 31), subscription.plan, 31) == date(2024, 2, 28)


@pytest.mark.django_db
def test_month_end_billing_keeps_original_anchor(subscription):
    subscription.start_date = date(2028, 1, 31)
    subscription.next_invoice_date = subscription.start_date
    subscription.save()
    first = generate_invoice(subscription.pk, date(2028, 1, 31))
    second = generate_invoice(subscription.pk, date(2028, 2, 29))
    third = generate_invoice(subscription.pk, date(2028, 3, 31))
    assert [invoice.period_start for invoice in (first, second, third)] == [
        date(2028, 1, 31),
        date(2028, 2, 29),
        date(2028, 3, 31),
    ]


@pytest.mark.django_db
def test_used_up_discount_is_not_applied(subscription):
    discount = Discount.objects.create(
        name="Once",
        discount_type="fixed",
        value=50,
        min_amount=0,
        start_date=date(2026, 1, 1),
        usage_limit=1,
    )
    subscription.discount = discount
    subscription.save()
    assert generate_invoice(subscription.pk, date(2026, 1, 1)).discount_total == 50
    assert generate_invoice(subscription.pk, date(2026, 2, 1)).discount_total == 0
