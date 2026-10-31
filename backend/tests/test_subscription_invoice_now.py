"""POST /api/subscriptions/{id}/invoice-now/: manual billing of one due period (M3).

The action must go through the billing engine: one due period only, no money math
in the view, no bypassing of billing dates, and friendly domain errors otherwise.
"""

import itertools
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.utils import timezone

from apps.accounts.models import Customer, Role
from apps.billing.models import Invoice, InvoiceStatus
from apps.catalog.models import PaymentTerm, Plan
from apps.subscriptions.models import Subscription

TODAY = timezone.localdate()
NUMBERS = itertools.count(1)


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


def make_subscription(customer, plan, term, **extra):
    fields = {
        "number": f"SUB/2026/{next(NUMBERS):05d}",
        "customer": customer,
        "plan": plan,
        "payment_term": term,
        "status": "active",
        "start_date": TODAY,
        "next_invoice_date": TODAY,
    }
    fields.update(extra)
    return Subscription.objects.create(**fields)


def url(subscription):
    return f"/api/subscriptions/{subscription.pk}/invoice-now/"


def error_code(response):
    return response.json()["error"]["code"]


# --- authorization ------------------------------------------------------------


@pytest.mark.parametrize("role", [Role.ADMIN, Role.STAFF])
def test_admin_and_staff_bill_the_due_period(api, make_user, people, plan, term, role):
    actor = make_user(f"billing-{role}@cadence.test", role=role)
    subscription = make_subscription(people.asha_customer, plan, term)
    api.force_authenticate(actor)

    response = api.post(url(subscription))

    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["status"] == "draft"
    assert body["subscription"]["id"] == subscription.pk
    # Dates and money come from the engine, not the request or the view.
    assert body["invoice_date"] == str(TODAY)
    assert body["period_start"] == str(TODAY)
    assert body["due_date"] == str(TODAY + timedelta(days=15))
    assert body["subtotal"] == "100.00"
    assert body["tax_total"] == "0.00"
    assert body["total"] == "100.00"

    invoice = Invoice.objects.get(pk=body["id"])
    assert invoice.subscription_id == subscription.pk
    assert invoice.invoice_date == invoice.period_start == TODAY

    subscription.refresh_from_db()
    assert subscription.next_invoice_date == invoice.period_end + timedelta(days=1)
    assert subscription.next_invoice_date > TODAY


def test_customers_cannot_invoice_their_own_subscription(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term)
    api.force_authenticate(people.asha)

    response = api.post(url(subscription))

    assert response.status_code == 403
    assert Invoice.objects.filter(subscription=subscription).count() == 0
    subscription.refresh_from_db()
    assert subscription.next_invoice_date == TODAY


def test_unauthenticated_requests_are_rejected(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term)

    response = api.post(url(subscription))

    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"
    assert Invoice.objects.filter(subscription=subscription).count() == 0


def test_missing_subscription_is_404(api, people):
    api.force_authenticate(people.staff)

    assert api.post("/api/subscriptions/999999/invoice-now/").status_code == 404


def test_only_post_is_allowed(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term)
    api.force_authenticate(people.staff)

    assert api.get(url(subscription)).status_code == 405


# --- one due period, repeat calls ---------------------------------------------


def test_only_the_due_period_is_billed_without_catch_up(api, people, plan, term):
    stale_start = TODAY - timedelta(days=62)
    subscription = make_subscription(
        people.asha_customer,
        plan,
        term,
        start_date=stale_start - timedelta(days=5),
        next_invoice_date=stale_start,
    )
    api.force_authenticate(people.staff)

    response = api.post(url(subscription))

    assert response.status_code == 201, response.json()
    assert response.json()["period_start"] == str(stale_start)
    assert Invoice.objects.filter(subscription=subscription).count() == 1

    # The cursor moved by exactly one period; missed periods were not caught up.
    subscription.refresh_from_db()
    assert subscription.next_invoice_date > stale_start
    assert Invoice.objects.filter(subscription=subscription).count() == 1


def test_repeat_call_does_not_double_bill(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term)
    api.force_authenticate(people.staff)

    first = api.post(url(subscription))
    assert first.status_code == 201, first.json()

    second = api.post(url(subscription))

    assert second.status_code == 400
    assert error_code(second) == "invoice_not_due"
    assert Invoice.objects.filter(subscription=subscription).count() == 1


def test_period_already_invoiced_is_refused_without_moving_the_cursor(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term)
    Invoice.objects.create(
        number="INV/2026/09999",
        subscription=subscription,
        customer=subscription.customer,
        status=InvoiceStatus.DRAFT,
        invoice_date=TODAY,
        due_date=TODAY + timedelta(days=15),
        period_start=TODAY,
        period_end=TODAY + timedelta(days=30),
        subtotal=Decimal("100.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("100.00"),
        amount_paid=Decimal("0.00"),
    )
    api.force_authenticate(people.staff)

    response = api.post(url(subscription))

    assert response.status_code == 400
    assert error_code(response) == "invoice_already_billed"
    assert Invoice.objects.filter(subscription=subscription).count() == 1
    subscription.refresh_from_db()
    assert subscription.next_invoice_date == TODAY


def test_cancelled_invoice_for_the_period_does_not_block_billing(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term)
    Invoice.objects.create(
        number="INV/2026/09998",
        subscription=subscription,
        customer=subscription.customer,
        status=InvoiceStatus.CANCELLED,
        invoice_date=TODAY,
        due_date=TODAY + timedelta(days=15),
        period_start=TODAY,
        period_end=TODAY + timedelta(days=30),
        subtotal=Decimal("100.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("100.00"),
        amount_paid=Decimal("0.00"),
    )
    api.force_authenticate(people.staff)

    response = api.post(url(subscription))

    assert response.status_code == 201, response.json()
    assert Invoice.objects.filter(subscription=subscription).count() == 2


# --- ineligible subscriptions get friendly errors -----------------------------


def test_inactive_subscription_is_refused(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term, status="paused")
    api.force_authenticate(people.staff)

    response = api.post(url(subscription))

    assert response.status_code == 400
    assert error_code(response) == "subscription_not_active"
    assert "paused" in response.json()["error"]["message"]
    assert Invoice.objects.filter(subscription=subscription).count() == 0


def test_future_period_is_not_due(api, people, plan, term):
    subscription = make_subscription(
        people.asha_customer, plan, term, next_invoice_date=TODAY + timedelta(days=10)
    )
    api.force_authenticate(people.staff)

    response = api.post(url(subscription))

    assert response.status_code == 400
    assert error_code(response) == "invoice_not_due"
    due = TODAY + timedelta(days=10)
    assert f"{due:%d %b %Y}" in response.json()["error"]["message"]
    assert Invoice.objects.filter(subscription=subscription).count() == 0


def test_subscription_without_a_billing_cursor_is_not_due(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term, next_invoice_date=None)
    api.force_authenticate(people.staff)

    response = api.post(url(subscription))

    assert response.status_code == 400
    assert error_code(response) == "invoice_not_due"
    assert Invoice.objects.filter(subscription=subscription).count() == 0


def test_expired_subscription_is_refused(api, people, plan, term):
    subscription = make_subscription(
        people.asha_customer,
        plan,
        term,
        start_date=TODAY - timedelta(days=10),
        expiration_date=TODAY - timedelta(days=1),
    )
    api.force_authenticate(people.staff)

    response = api.post(url(subscription))

    assert response.status_code == 400
    assert error_code(response) == "subscription_expired"
    assert Invoice.objects.filter(subscription=subscription).count() == 0


def test_period_on_the_expiration_date_is_still_billable(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term, expiration_date=TODAY)
    api.force_authenticate(people.staff)

    response = api.post(url(subscription))

    assert response.status_code == 201, response.json()
