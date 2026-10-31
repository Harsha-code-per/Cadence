from datetime import date
from decimal import Decimal

import pytest

from apps.accounts.models import Customer, Role
from apps.billing.models import Invoice, InvoiceStatus
from apps.core.exceptions import DomainError
from apps.payments.models import PaymentMethod
from apps.payments.services import record_payment


@pytest.fixture
def confirmed_invoice(db, subscription):
    return Invoice.objects.create(
        number="INV/2026/00001",
        subscription=subscription,
        customer=subscription.customer,
        status=InvoiceStatus.CONFIRMED,
        invoice_date=date(2026, 1, 1),
        due_date=date(2026, 1, 15),
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
        subtotal=Decimal("1000.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("180.00"),
        total=Decimal("1180.00"),
        amount_paid=Decimal("0.00"),
    )


def test_record_partial_and_full_payment(confirmed_invoice, make_user):
    staff = make_user(email="staff@brightloop.test", role=Role.STAFF)

    # 1. Partial payment: 500.00
    p1 = record_payment(
        invoice_id=confirmed_invoice.id,
        amount=Decimal("500.00"),
        method=PaymentMethod.UPI,
        payment_date=date(2026, 1, 5),
        reference="UPI-REF-001",
        actor=staff,
    )
    assert p1.number == "PAY/2026/00001"
    assert p1.amount == Decimal("500.00")

    confirmed_invoice.refresh_from_db()
    assert confirmed_invoice.amount_paid == Decimal("500.00")
    assert confirmed_invoice.outstanding == Decimal("680.00")
    assert confirmed_invoice.status == InvoiceStatus.CONFIRMED

    # 2. Complete the remaining balance: 680.00
    p2 = record_payment(
        invoice_id=confirmed_invoice.id,
        amount=Decimal("680.00"),
        method=PaymentMethod.BANK_TRANSFER,
        payment_date=date(2026, 1, 10),
        actor=staff,
    )
    assert p2.number == "PAY/2026/00002"

    confirmed_invoice.refresh_from_db()
    assert confirmed_invoice.amount_paid == Decimal("1180.00")
    assert confirmed_invoice.outstanding == Decimal("0.00")
    assert confirmed_invoice.status == InvoiceStatus.PAID


def test_overpayment_rejected(confirmed_invoice, make_user):
    staff = make_user(email="staff@brightloop.test", role=Role.STAFF)
    with pytest.raises(DomainError) as exc_info:
        record_payment(
            invoice_id=confirmed_invoice.id,
            amount=Decimal("1500.00"),
            method=PaymentMethod.CARD,
            payment_date=date(2026, 1, 5),
            actor=staff,
        )
    assert exc_info.value.code == "overpayment"
    assert "amount" in exc_info.value.field_errors


def test_payment_rejected_for_unpayable_invoice(confirmed_invoice, make_user):
    staff = make_user(email="staff@brightloop.test", role=Role.STAFF)

    # Draft invoice
    confirmed_invoice.status = InvoiceStatus.DRAFT
    confirmed_invoice.save(update_fields=["status"])

    with pytest.raises(DomainError) as exc_info:
        record_payment(
            invoice_id=confirmed_invoice.id,
            amount=Decimal("100.00"),
            method=PaymentMethod.CASH,
            payment_date=date(2026, 1, 5),
            actor=staff,
        )
    assert exc_info.value.code == "invoice_not_payable"


def test_payment_api_permissions_and_scoping(api, make_user, confirmed_invoice):
    admin = make_user(email="admin@brightloop.test", role=Role.ADMIN)
    customer_user = make_user(email="asha@brightloop.test", role=Role.CUSTOMER)
    confirmed_invoice.customer.user = customer_user
    confirmed_invoice.customer.save()

    other_user = make_user(email="other@brightloop.test", role=Role.CUSTOMER)
    Customer.objects.create(name="Other", email=other_user.email, user=other_user)

    # Admin records payment via API
    api.force_authenticate(user=admin)
    response = api.post(
        "/api/payments/",
        {
            "invoice": confirmed_invoice.id,
            "method": "upi",
            "amount": "200.00",
            "payment_date": "2026-01-05",
            "reference": "UPI12345",
        },
    )
    assert response.status_code == 201
    assert response.data["amount"] == "200.00"
    payment_id = response.data["id"]

    # Customer user (Asha) can see her payment
    api.force_authenticate(user=customer_user)
    cust_list = api.get("/api/payments/")
    assert cust_list.status_code == 200
    assert cust_list.data["count"] == 1
    assert cust_list.data["results"][0]["id"] == payment_id

    # Customer tries to record payment via API -> 403 Forbidden
    cust_create = api.post(
        "/api/payments/",
        {
            "invoice": confirmed_invoice.id,
            "method": "upi",
            "amount": "100.00",
            "payment_date": "2026-01-06",
        },
    )
    assert cust_create.status_code == 403

    # Other customer cannot see Asha's payment (returns empty list / 404 for detail)
    api.force_authenticate(user=other_user)
    other_list = api.get("/api/payments/")
    assert other_list.status_code == 200
    assert other_list.data["count"] == 0

    other_detail = api.get(f"/api/payments/{payment_id}/")
    assert other_detail.status_code == 404
