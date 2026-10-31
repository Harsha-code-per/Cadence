"""Invoice API: scoping, detail, filters, confirm/cancel/send and bulk confirm (M3)."""

import itertools
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.core import mail
from django.utils import timezone

from apps.accounts.models import Customer, Role
from apps.billing.models import (
    DiscountRedemption,
    Invoice,
    InvoiceLine,
    InvoiceLineTax,
    InvoiceStatus,
)
from apps.catalog.models import Discount, PaymentTerm, Plan
from apps.core.models import AuditLog
from apps.payments.models import Payment
from apps.subscriptions.models import Subscription

TODAY = timezone.localdate()
NUMBERS = itertools.count(1)
CENT = Decimal("0.01")


@pytest.fixture
def people(make_user):
    admin = make_user("admin@cadence.test", role=Role.ADMIN)
    staff = make_user("staff@cadence.test", role=Role.STAFF)
    asha = make_user("asha@cadence.test", role=Role.CUSTOMER)
    other = make_user("other@cadence.test", role=Role.CUSTOMER)
    return SimpleNamespace(
        admin=admin,
        staff=staff,
        asha=asha,
        other=other,
        asha_customer=Customer.objects.create(
            user=asha, name="Asha Rao", company="Rao Traders", email="asha@rao.test"
        ),
        other_customer=Customer.objects.create(
            user=other, name="Vikram Shah", company="Shah Media", email="vikram@shah.test"
        ),
    )


@pytest.fixture
def term(db):
    return PaymentTerm.objects.create(name="Net 15", due_days=15)


@pytest.fixture
def plan(term):
    return Plan.objects.create(
        name="Growth Monthly",
        price=Decimal("100.00"),
        start_date=TODAY - timedelta(days=60),
    )


def make_subscription(customer, plan, term):
    return Subscription.objects.create(
        number=f"SUB/2026/{next(NUMBERS):05d}",
        customer=customer,
        plan=plan,
        payment_term=term,
        status="active",
        start_date=TODAY - timedelta(days=60),
        next_invoice_date=TODAY,
    )


@pytest.fixture
def make_invoice(db):
    counter = itertools.count(1)

    def _make(
        subscription,
        *,
        status=InvoiceStatus.DRAFT,
        subtotal="100.00",
        discount_total="0.00",
        tax_total="18.00",
        total="118.00",
        amount_paid="0.00",
        invoice_date=None,
        due_date=None,
        period_start=None,
        period_end=None,
        **extra,
    ):
        invoice_date = invoice_date or TODAY
        period_start = period_start or invoice_date
        return Invoice.objects.create(
            number=f"INV/2026/{next(counter):05d}",
            subscription=subscription,
            customer=subscription.customer,
            status=status,
            invoice_date=invoice_date,
            due_date=due_date or invoice_date + timedelta(days=15),
            period_start=period_start,
            period_end=period_end or period_start + timedelta(days=30),
            subtotal=Decimal(subtotal),
            discount_total=Decimal(discount_total),
            tax_total=Decimal(tax_total),
            total=Decimal(total),
            amount_paid=Decimal(amount_paid),
            **extra,
        )

    return _make


def add_line(
    invoice,
    *,
    description="Seat",
    product=None,
    quantity=1,
    unit_price="100.00",
    discount="0.00",
    tax_name="GST 18",
    tax_rate="18.00",
):
    amount = Decimal(unit_price) * quantity
    discount_amount = Decimal(discount)
    tax_amount = ((amount - discount_amount) * Decimal(tax_rate) / 100).quantize(CENT)
    line = InvoiceLine.objects.create(
        invoice=invoice,
        product=product,
        description=description,
        quantity=quantity,
        unit_price=Decimal(unit_price),
        amount=amount,
        discount_amount=discount_amount,
        tax_amount=tax_amount,
        total=amount - discount_amount + tax_amount,
    )
    InvoiceLineTax.objects.create(
        line=line,
        tax=None,
        name=tax_name,
        rate=Decimal(tax_rate),
        amount=tax_amount,
    )
    return line


# --- list / detail / scoping -------------------------------------------------


def test_customer_list_is_scoped_and_foreign_detail_is_404(api, people, plan, term, make_invoice):
    own_sub = make_subscription(people.asha_customer, plan, term)
    foreign_sub = make_subscription(people.other_customer, plan, term)
    own = make_invoice(own_sub)
    foreign = make_invoice(foreign_sub)

    api.force_authenticate(people.asha)
    body = api.get("/api/invoices/").json()
    assert body["count"] == 1
    assert [row["id"] for row in body["results"]] == [own.pk]
    assert body["results"][0]["customer"] == {
        "id": people.asha_customer.pk,
        "name": "Asha Rao",
        "company": "Rao Traders",
    }
    assert body["results"][0]["outstanding"] == "118.00"

    response = api.get(f"/api/invoices/{foreign.pk}/")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_staff_lists_everything_with_filters_and_pagination(api, people, plan, term, make_invoice):
    asha_sub = make_subscription(people.asha_customer, plan, term)
    other_sub = make_subscription(people.other_customer, plan, term)
    overdue = make_invoice(
        asha_sub,
        status=InvoiceStatus.CONFIRMED,
        invoice_date=TODAY - timedelta(days=30),
        period_start=TODAY - timedelta(days=30),
        due_date=TODAY - timedelta(days=1),
    )
    make_invoice(
        other_sub,
        status=InvoiceStatus.PAID,
        amount_paid="118.00",
        invoice_date=TODAY - timedelta(days=10),
        period_start=TODAY - timedelta(days=10),
        due_date=TODAY + timedelta(days=5),
    )
    draft_sub = make_subscription(people.other_customer, plan, term)
    make_invoice(draft_sub, status=InvoiceStatus.DRAFT, due_date=TODAY + timedelta(days=15))

    api.force_authenticate(people.staff)
    body = api.get("/api/invoices/").json()
    assert body["count"] == 3
    assert set(body) == {"count", "next", "previous", "results"}

    by_status = api.get("/api/invoices/?status=confirmed").json()
    assert [row["id"] for row in by_status["results"]] == [overdue.pk]

    by_overdue = api.get("/api/invoices/?overdue=true").json()
    assert [row["id"] for row in by_overdue["results"]] == [overdue.pk]

    by_customer = api.get(f"/api/invoices/?customer={people.asha_customer.pk}").json()
    assert [row["id"] for row in by_customer["results"]] == [overdue.pk]

    by_search = api.get("/api/invoices/?search=Asha").json()
    assert [row["id"] for row in by_search["results"]] == [overdue.pk]

    by_subscription = api.get(f"/api/invoices/?subscription={asha_sub.pk}").json()
    assert [row["id"] for row in by_subscription["results"]] == [overdue.pk]

    by_date = api.get(f"/api/invoices/?invoice_date__gte={TODAY - timedelta(days=20)}").json()
    assert by_date["count"] == 2


def test_detail_includes_lines_taxes_payments_outstanding_and_overdue(
    api, people, plan, term, make_invoice
):
    sub = make_subscription(people.asha_customer, plan, term)
    invoice = make_invoice(
        sub,
        status=InvoiceStatus.CONFIRMED,
        total="118.00",
        amount_paid="50.00",
        invoice_date=TODAY - timedelta(days=30),
        period_start=TODAY - timedelta(days=30),
        due_date=TODAY - timedelta(days=1),
    )
    add_line(invoice)
    Payment.objects.create(
        number="PAY/2026/00001",
        invoice=invoice,
        method="cash",
        amount=Decimal("50.00"),
        payment_date=TODAY,
    )

    api.force_authenticate(people.staff)
    response = api.get(f"/api/invoices/{invoice.pk}/")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == "118.00"
    assert body["outstanding"] == "68.00"
    assert body["is_overdue"] is True
    assert len(body["lines"]) == 1
    assert body["lines"][0]["quantity"] == 1
    assert body["lines"][0]["taxes"][0]["name"] == "GST 18"
    assert body["lines"][0]["taxes"][0]["rate"] == "18.00"
    assert body["payments"][0]["amount"] == "50.00"
    assert body["changes"] == []
    assert "cost_price" not in response.content.decode()


# --- "why did my bill change?" ----------------------------------------------


def test_changes_explain_quantity_new_removed_lines_and_discount(
    api, people, plan, term, make_invoice
):
    sub = make_subscription(people.asha_customer, plan, term)
    previous = make_invoice(
        sub,
        status=InvoiceStatus.CONFIRMED,
        subtotal="520.00",
        tax_total="93.60",
        total="613.60",
        invoice_date=TODAY - timedelta(days=31),
        period_start=TODAY - timedelta(days=31),
    )
    add_line(previous, description="Seat", quantity=5, tax_rate="18.00")
    add_line(previous, description="Add-on", quantity=1, unit_price="20.00", tax_rate="18.00")

    current = make_invoice(
        sub,
        status=InvoiceStatus.DRAFT,
        subtotal="620.00",
        discount_total="50.00",
        tax_total="102.60",
        total="672.60",
        invoice_date=TODAY,
        period_start=TODAY,
    )
    add_line(current, description="Seat", quantity=6, discount="50.00", tax_rate="18.00")
    add_line(current, description="Support", quantity=1, unit_price="20.00", tax_rate="18.00")

    api.force_authenticate(people.staff)
    body = api.get(f"/api/invoices/{current.pk}/").json()
    changes = body["changes"]
    kinds = {change["kind"] for change in changes}

    assert kinds == {"quantity_changed", "line_added", "line_removed", "discount_changed"}
    quantity = next(change for change in changes if change["kind"] == "quantity_changed")
    assert "5 → 6" in quantity["description"]
    assert quantity["amount_delta"] == "59.00"
    assert any("New line: Support" in change["description"] for change in changes)
    assert any("Line removed: Add-on" in change["description"] for change in changes)
    assert any("₹50.00" in change["description"] for change in changes)
    assert all(set(change) == {"kind", "description", "amount_delta"} for change in changes)


def test_changes_explain_a_tax_rate_change(api, people, plan, term, make_invoice):
    sub = make_subscription(people.asha_customer, plan, term)
    previous = make_invoice(
        sub,
        status=InvoiceStatus.CONFIRMED,
        invoice_date=TODAY - timedelta(days=31),
        period_start=TODAY - timedelta(days=31),
    )
    add_line(previous, description="Seat", tax_rate="18.00")
    current = make_invoice(
        sub,
        status=InvoiceStatus.DRAFT,
        tax_total="12.00",
        total="112.00",
        invoice_date=TODAY,
        period_start=TODAY,
    )
    add_line(current, description="Seat", tax_rate="12.00")

    api.force_authenticate(people.staff)
    changes = api.get(f"/api/invoices/{current.pk}/").json()["changes"]
    assert len(changes) == 1
    assert changes[0]["kind"] == "tax_changed"
    assert "18.00% to 12.00%" in changes[0]["description"]
    assert changes[0]["amount_delta"] == "-6.00"


# --- confirm ----------------------------------------------------------------


def test_staff_confirms_a_draft_and_audits_it(api, people, plan, term, make_invoice):
    invoice = make_invoice(make_subscription(people.asha_customer, plan, term))

    api.force_authenticate(people.staff)
    response = api.post(f"/api/invoices/{invoice.pk}/confirm/")
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"

    invoice.refresh_from_db()
    assert invoice.status == InvoiceStatus.CONFIRMED
    assert AuditLog.objects.filter(
        action="invoice.confirm", entity_type="billing.invoice", entity_id=invoice.pk
    ).exists()


def test_confirm_requires_internal_role_and_a_draft(api, people, plan, term, make_invoice):
    invoice = make_invoice(make_subscription(people.asha_customer, plan, term))

    api.force_authenticate(people.asha)
    forbidden = api.post(f"/api/invoices/{invoice.pk}/confirm/")
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "permission_denied"

    invoice.status = InvoiceStatus.CONFIRMED
    invoice.save(update_fields=["status", "updated_at"])
    api.force_authenticate(people.admin)
    invalid = api.post(f"/api/invoices/{invoice.pk}/confirm/")
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "invalid_transition"


def test_confirm_bulk_confirms_only_drafts(api, people, plan, term, make_invoice):
    sub = make_subscription(people.asha_customer, plan, term)
    first = make_invoice(sub)
    second = make_invoice(
        sub,
        period_start=TODAY + timedelta(days=31),
        invoice_date=TODAY + timedelta(days=31),
    )
    already = make_invoice(
        sub,
        status=InvoiceStatus.CONFIRMED,
        period_start=TODAY + timedelta(days=62),
        invoice_date=TODAY + timedelta(days=62),
    )

    api.force_authenticate(people.staff)
    response = api.post(
        "/api/invoices/confirm-bulk/",
        {"ids": [first.pk, second.pk, already.pk, 999999]},
        format="json",
    )
    assert response.status_code == 200
    assert response.json() == {"confirmed": 2}
    assert (
        Invoice.objects.filter(pk__in=[first.pk, second.pk], status=InvoiceStatus.CONFIRMED).count()
        == 2
    )

    api.force_authenticate(people.asha)
    forbidden = api.post("/api/invoices/confirm-bulk/", {"ids": [first.pk]}, format="json")
    assert forbidden.status_code == 403


def test_confirm_bulk_rejects_an_empty_id_list(api, people, plan, term, make_invoice):
    invoice = make_invoice(make_subscription(people.asha_customer, plan, term))
    api.force_authenticate(people.staff)
    response = api.post("/api/invoices/confirm-bulk/", {"ids": []}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert invoice.status == InvoiceStatus.DRAFT


# --- cancel -----------------------------------------------------------------


def test_cancel_frees_the_discount_and_the_billing_period(api, people, plan, term, make_invoice):
    sub = make_subscription(people.asha_customer, plan, term)
    discount = Discount.objects.create(
        name="Launch 10%",
        code="LAUNCH10",
        discount_type="percent",
        value=Decimal("10.00"),
        start_date=TODAY - timedelta(days=30),
        usage_limit=1,
    )
    invoice = make_invoice(sub, discount_total="10.00", total="108.00")
    DiscountRedemption.objects.create(discount=discount, invoice=invoice, amount=Decimal("10.00"))

    api.force_authenticate(people.staff)
    response = api.post(f"/api/invoices/{invoice.pk}/cancel/")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    invoice.refresh_from_db()
    assert invoice.status == InvoiceStatus.CANCELLED
    assert not DiscountRedemption.objects.filter(invoice=invoice).exists()
    # Cancelled rows are excluded from uq_invoice_period, so the period can be re-billed.
    replacement = make_invoice(sub, period_start=invoice.period_start)
    assert replacement.pk != invoice.pk
    assert AuditLog.objects.filter(
        action="invoice.cancel", entity_id=invoice.pk, changes__released_discount_redemptions=1
    ).exists()


def test_cancel_rejects_paid_or_partially_paid_invoices(api, people, plan, term, make_invoice):
    sub = make_subscription(people.asha_customer, plan, term)
    partial = make_invoice(sub, status=InvoiceStatus.CONFIRMED, total="118.00", amount_paid="50.00")
    paid = make_invoice(
        sub,
        status=InvoiceStatus.PAID,
        total="118.00",
        amount_paid="118.00",
        period_start=TODAY + timedelta(days=31),
        invoice_date=TODAY + timedelta(days=31),
    )

    api.force_authenticate(people.staff)
    for invoice in (partial, paid):
        response = api.post(f"/api/invoices/{invoice.pk}/cancel/")
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_transition"
        invoice.refresh_from_db()
        assert invoice.status == (
            InvoiceStatus.PAID if invoice is paid else InvoiceStatus.CONFIRMED
        )

    api.force_authenticate(people.asha)
    assert api.post(f"/api/invoices/{partial.pk}/cancel/").status_code == 403


def test_cancel_rejects_an_already_cancelled_invoice(api, people, plan, term, make_invoice):
    invoice = make_invoice(
        make_subscription(people.asha_customer, plan, term), status=InvoiceStatus.CANCELLED
    )
    api.force_authenticate(people.staff)
    response = api.post(f"/api/invoices/{invoice.pk}/cancel/")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_transition"


# --- send -------------------------------------------------------------------


def test_send_emails_confirmed_and_paid_invoices(api, people, plan, term, make_invoice):
    sub = make_subscription(people.asha_customer, plan, term)
    confirmed = make_invoice(sub, status=InvoiceStatus.CONFIRMED)
    paid = make_invoice(
        sub,
        status=InvoiceStatus.PAID,
        total="118.00",
        amount_paid="118.00",
        period_start=TODAY + timedelta(days=31),
        invoice_date=TODAY + timedelta(days=31),
    )

    api.force_authenticate(people.staff)
    response = api.post(f"/api/invoices/{confirmed.pk}/send/")
    assert response.status_code == 200
    assert response.json()["sent_at"] is not None
    confirmed.refresh_from_db()
    assert confirmed.sent_at is not None

    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == ["asha@rao.test"]
    assert confirmed.number in message.subject
    assert confirmed.number in message.body
    assert f"/portal/invoices/{confirmed.pk}" in message.body
    assert "118.00" in message.body

    assert api.post(f"/api/invoices/{paid.pk}/send/").status_code == 200
    assert len(mail.outbox) == 2


def test_send_rejects_draft_cancelled_and_customer_requests_without_email(
    api, people, plan, term, make_invoice
):
    sub = make_subscription(people.asha_customer, plan, term)
    draft = make_invoice(sub)
    cancelled = make_invoice(
        sub,
        status=InvoiceStatus.CANCELLED,
        period_start=TODAY + timedelta(days=31),
        invoice_date=TODAY + timedelta(days=31),
    )

    api.force_authenticate(people.staff)
    for invoice in (draft, cancelled):
        response = api.post(f"/api/invoices/{invoice.pk}/send/")
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_transition"
        invoice.refresh_from_db()
        assert invoice.sent_at is None
    assert mail.outbox == []

    api.force_authenticate(people.asha)
    assert api.post(f"/api/invoices/{draft.pk}/send/").status_code == 403
    assert mail.outbox == []


def test_unauthenticated_requests_are_rejected(api, db):
    response = api.get("/api/invoices/")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"
