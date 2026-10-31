"""Subscription API: scoping, draft creation/editing, lines, actions and timeline (M3)."""

import itertools
from datetime import timedelta
from decimal import Decimal
from importlib.util import find_spec
from types import SimpleNamespace

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.accounts.models import Customer, Role
from apps.billing.models import Invoice
from apps.catalog.models import (
    Attribute,
    AttributeValue,
    PaymentTerm,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    QuotationTemplateLine,
    Tax,
)
from apps.core.models import AuditLog
from apps.subscriptions.models import Subscription, SubscriptionLine

TODAY = timezone.localdate()
NUMBERS = itertools.count(1)

# The state machine lands in a parallel M3 PR; action tests run once it is on the base branch.
needs_state_machine = pytest.mark.skipif(
    find_spec("apps.subscriptions.state") is None,
    reason="apps.subscriptions.state is in the parallel state-machine PR",
)


def make_subscription(
    customer,
    plan,
    term,
    *,
    status="draft",
    start_date=None,
    expiration_date=None,
    next_invoice_date=None,
    valid_until=None,
    number=None,
    **extra,
):
    return Subscription.objects.create(
        number=number or f"SUB/2025/{next(NUMBERS):05d}",
        customer=customer,
        plan=plan,
        payment_term=term,
        status=status,
        start_date=start_date or TODAY,
        expiration_date=expiration_date,
        next_invoice_date=next_invoice_date,
        valid_until=valid_until,
        **extra,
    )


def make_line(subscription, product, *, quantity=1, unit_price="10.00", variant=None):
    line = SubscriptionLine.objects.create(
        subscription=subscription,
        product=product,
        variant=variant,
        description="Line",
        quantity=quantity,
        unit_price=Decimal(unit_price),
    )
    line.taxes.set(product.taxes.all())
    return line


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
        pausable=True,
    )


@pytest.fixture
def product(db):
    tax = Tax.objects.create(name="GST 18", rate=Decimal("18.00"))
    item = Product.objects.create(
        name="Brightloop CRM",
        sales_price=Decimal("1200.00"),
        cost_price=Decimal("300.00"),
    )
    item.taxes.set([tax])
    return item


@pytest.fixture
def variant(product):
    brand = Attribute.objects.create(name="Brand")
    odoo = AttributeValue.objects.create(
        attribute=brand, name="Odoo", extra_price=Decimal("560.00")
    )
    item = ProductVariant.objects.create(product=product, sku="CRM-ODOO")
    item.values.set([odoo])
    return item


def create_payload(people, plan, term, product=None, **overrides):
    payload = {
        "customer": people.asha_customer.pk,
        "plan": plan.pk,
        "start_date": str(TODAY),
        "payment_term": term.pk,
        "notes": "Pilot",
        "lines": [],
    }
    if product is not None:
        payload["lines"] = [{"product": product.pk, "quantity": 1}]
    payload.update(overrides)
    return payload


# --- scoping, filters, search -------------------------------------------------


def test_customer_list_is_scoped_and_foreign_detail_is_404(api, people, plan, term):
    own = make_subscription(people.asha_customer, plan, term)
    make_subscription(people.other_customer, plan, term)

    api.force_authenticate(people.asha)
    body = api.get("/api/subscriptions/").json()
    assert body["count"] == 1
    assert body["results"][0]["id"] == own.pk

    api.force_authenticate(people.other)
    foreign = api.get(f"/api/subscriptions/{own.pk}/")
    assert foreign.status_code == 404
    assert foreign.json()["error"]["code"] == "not_found"


def test_staff_lists_everything_and_filters_search(api, people, plan, term):
    active = make_subscription(
        people.asha_customer,
        plan,
        term,
        status="active",
        next_invoice_date=TODAY - timedelta(days=1),
    )
    draft = make_subscription(
        people.other_customer,
        plan,
        term,
        status="draft",
        next_invoice_date=TODAY + timedelta(days=10),
    )

    api.force_authenticate(people.staff)
    assert api.get("/api/subscriptions/").json()["count"] == 2

    by_status = api.get("/api/subscriptions/?status=active").json()
    assert [row["id"] for row in by_status["results"]] == [active.pk]

    by_customer = api.get(f"/api/subscriptions/?customer={people.other_customer.pk}").json()
    assert [row["id"] for row in by_customer["results"]] == [draft.pk]

    by_plan = api.get(f"/api/subscriptions/?plan={plan.pk}").json()
    assert by_plan["count"] == 2

    due = api.get(f"/api/subscriptions/?next_invoice_date__lte={TODAY}").json()
    assert [row["id"] for row in due["results"]] == [active.pk]

    search = api.get("/api/subscriptions/?search=Rao").json()
    assert [row["id"] for row in search["results"]] == [active.pk]

    ordered = api.get("/api/subscriptions/?ordering=-number").json()
    assert ordered["results"][0]["number"] >= ordered["results"][1]["number"]


def test_anonymous_is_rejected(api, db):
    response = api.get("/api/subscriptions/")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_subscription_list_has_no_n_plus_one(
    api, people, plan, term, product, variant, django_assert_num_queries
):
    first = make_subscription(people.asha_customer, plan, term, status="active")
    make_line(first, product, variant=variant)
    api.force_authenticate(people.staff)

    with CaptureQueriesContext(connection) as baseline:
        api.get("/api/subscriptions/")

    for _ in range(4):
        subscription = make_subscription(people.asha_customer, plan, term)
        make_line(subscription, product)

    # The same number of queries for 5 rows as for 1: lines, variants and taxes are prefetched.
    with django_assert_num_queries(len(baseline)):
        response = api.get("/api/subscriptions/")
    assert response.json()["count"] == 5


# --- create / from-template ---------------------------------------------------


def test_staff_create_uses_variant_price_and_product_taxes(
    api, people, plan, term, product, variant
):
    api.force_authenticate(people.staff)
    response = api.post(
        "/api/subscriptions/",
        create_payload(
            people,
            plan,
            term,
            lines=[{"product": product.pk, "variant": variant.pk, "quantity": 5}],
        ),
        format="json",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["status"] == "draft"
    assert body["number"].startswith("SUB/")
    assert body["customer"] == {
        "id": people.asha_customer.pk,
        "name": "Asha Rao",
        "company": "Rao Traders",
    }
    assert body["plan"]["id"] == plan.pk
    assert body["allowed_actions"] == ["send", "close"]
    assert body["salesperson"]["id"] == people.staff.pk

    line = body["lines"][0]
    assert line["unit_price"] == "1760.00"  # 1200 product + 560 variant extra
    assert line["amount"] == "8800.00"
    assert line["description"] == "Brightloop CRM (Brand: Odoo)"
    assert line["tax_ids"] == [product.taxes.first().pk]
    assert body["recurring_total"] == "8900.00"  # plan fee + lines
    assert AuditLog.objects.filter(action="subscription.create", entity_id=body["id"]).exists()


def test_create_validates_dates_and_read_only_fields(api, people, plan, term, product):
    api.force_authenticate(people.staff)
    payload = create_payload(
        people,
        plan,
        term,
        product,
        expiration_date=str(TODAY - timedelta(days=1)),
    )
    response = api.post("/api/subscriptions/", payload, format="json")
    assert response.status_code == 400
    assert "expiration_date" in response.json()["error"]["field_errors"]

    payload = create_payload(people, plan, term, product, status="active")
    response = api.post("/api/subscriptions/", payload, format="json")
    assert response.status_code == 400
    assert "status" in response.json()["error"]["field_errors"]


def test_from_template_copies_plan_lines_and_term(api, people, plan, term, product, variant):
    template = QuotationTemplate.objects.create(
        name="CRM pilot", validity_days=15, plan=plan, payment_term=term, notes="Pilot notes"
    )
    QuotationTemplateLine.objects.create(
        template=template, product=product, variant=variant, quantity=3
    )

    api.force_authenticate(people.staff)
    response = api.post(
        "/api/subscriptions/from-template/",
        {"template": template.pk, "customer": people.asha_customer.pk, "start_date": str(TODAY)},
        format="json",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["status"] == "draft"
    assert body["plan"]["id"] == plan.pk
    assert body["quotation_template"] == template.pk
    assert body["notes"] == "Pilot notes"
    assert body["lines"][0]["quantity"] == 3
    assert body["lines"][0]["unit_price"] == "1760.00"


def test_from_template_requires_a_payment_term(api, people, plan, product):
    template = QuotationTemplate.objects.create(name="No term", plan=plan)
    QuotationTemplateLine.objects.create(template=template, product=product, quantity=1)

    api.force_authenticate(people.staff)
    response = api.post(
        "/api/subscriptions/from-template/",
        {"template": template.pk, "customer": people.asha_customer.pk, "start_date": str(TODAY)},
        format="json",
    )
    assert response.status_code == 400
    assert "template" in response.json()["error"]["field_errors"]


def test_customer_cannot_write_or_run_internal_actions(api, people, plan, term, product):
    subscription = make_subscription(people.asha_customer, plan, term)
    line = make_line(subscription, product)
    api.force_authenticate(people.asha)

    assert (
        api.post("/api/subscriptions/", create_payload(people, plan, term, product)).status_code
        == 403
    )
    assert (
        api.patch(
            f"/api/subscriptions/{subscription.pk}/", {"notes": "nope"}, format="json"
        ).status_code
        == 403
    )
    assert (
        api.post(
            f"/api/subscriptions/{subscription.pk}/lines/",
            {"product": product.pk, "quantity": 1},
            format="json",
        ).status_code
        == 403
    )
    assert api.delete(f"/api/subscriptions/{subscription.pk}/lines/{line.pk}/").status_code == 403
    assert api.post(f"/api/subscriptions/{subscription.pk}/send/").status_code == 403


# --- update -------------------------------------------------------------------


def test_patch_draft_only_and_status_is_never_writable(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term)
    api.force_authenticate(people.staff)
    url = f"/api/subscriptions/{subscription.pk}/"

    response = api.patch(
        url, {"notes": "Updated", "expiration_date": str(TODAY + timedelta(days=30))}, format="json"
    )
    assert response.status_code == 200, response.json()
    assert response.json()["notes"] == "Updated"
    assert response.json()["expiration_date"] == str(TODAY + timedelta(days=30))

    response = api.patch(url, {"status": "active"}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "status" in response.json()["error"]["field_errors"]
    subscription.refresh_from_db()
    assert subscription.status == "draft"

    response = api.patch(url, {"lines": []}, format="json")
    assert response.status_code == 400
    assert "lines" in response.json()["error"]["field_errors"]

    response = api.patch(url, {"salesperson": people.staff.pk}, format="json")
    assert response.status_code == 400
    assert "salesperson" in response.json()["error"]["field_errors"]

    response = api.patch(url, {"expiration_date": str(TODAY - timedelta(days=1))}, format="json")
    assert response.status_code == 400
    assert "expiration_date" in response.json()["error"]["field_errors"]

    subscription.status = "quotation"
    subscription.save(update_fields=["status"])
    response = api.patch(url, {"notes": "Too late"}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_transition"


# --- line management ----------------------------------------------------------


def test_line_management_in_draft(api, people, plan, term, product, variant):
    subscription = make_subscription(people.asha_customer, plan, term)
    original = make_line(subscription, product, variant=variant)
    api.force_authenticate(people.staff)
    lines_url = f"/api/subscriptions/{subscription.pk}/lines/"

    response = api.post(lines_url, {"product": product.pk, "quantity": 2}, format="json")
    assert response.status_code == 201, response.json()
    added = response.json()
    assert added["unit_price"] == "1200.00"  # product default
    assert added["tax_ids"] == [product.taxes.first().pk]

    response = api.patch(
        f"{lines_url}{added['id']}/",
        {"quantity": 3, "unit_price": "100.00", "tax_ids": []},
        format="json",
    )
    assert response.status_code == 200, response.json()
    assert response.json()["amount"] == "300.00"
    assert response.json()["tax_ids"] == []

    listing = api.get(lines_url).json()
    assert listing["count"] == 2

    assert api.delete(f"{lines_url}{added['id']}/").status_code == 204
    assert api.get(lines_url).json()["count"] == 1

    free_line = api.post(
        lines_url, {"product": product.pk, "quantity": 1, "unit_price": "0.00"}, format="json"
    )
    assert free_line.status_code == 201, free_line.json()
    assert free_line.json()["unit_price"] == "0.00"  # explicit zero is not replaced by the default

    other_product = Product.objects.create(
        name="Brightloop Helpdesk", sales_price=Decimal("500.00"), cost_price=Decimal("0")
    )
    mismatch = api.post(
        lines_url,
        {"product": other_product.pk, "variant": variant.pk, "quantity": 1},
        format="json",
    )
    assert mismatch.status_code == 400
    assert "variant" in mismatch.json()["error"]["field_errors"]

    bad_quantity = api.post(lines_url, {"product": product.pk, "quantity": 0}, format="json")
    assert bad_quantity.status_code == 400
    assert "quantity" in bad_quantity.json()["error"]["field_errors"]

    bad_price = api.post(
        lines_url, {"product": product.pk, "quantity": 1, "unit_price": "-1.00"}, format="json"
    )
    assert bad_price.status_code == 400
    assert "unit_price" in bad_price.json()["error"]["field_errors"]

    # Moving a line to another product while keeping its variant is rejected too.
    response = api.patch(f"{lines_url}{original.pk}/", {"product": other_product.pk}, format="json")
    assert response.status_code == 400
    assert "variant" in response.json()["error"]["field_errors"]


def test_lines_are_locked_after_draft(api, people, plan, term, product):
    subscription = make_subscription(people.asha_customer, plan, term, status="quotation")
    line = make_line(subscription, product)
    api.force_authenticate(people.staff)

    response = api.patch(
        f"/api/subscriptions/{subscription.pk}/lines/{line.pk}/",
        {"quantity": 2},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_transition"

    response = api.post(
        f"/api/subscriptions/{subscription.pk}/lines/",
        {"product": product.pk, "quantity": 1},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_transition"


# --- lifecycle actions --------------------------------------------------------


@needs_state_machine
def test_staff_lifecycle_activation_guard_and_renewal(api, people, plan, term, product):
    api.force_authenticate(people.staff)
    created = api.post(
        "/api/subscriptions/",
        create_payload(people, plan, term, lines=[{"product": product.pk, "quantity": 5}]),
        format="json",
    )
    assert created.status_code == 201, created.json()
    subscription_id = created.json()["id"]
    url = f"/api/subscriptions/{subscription_id}"

    sent = api.post(f"{url}/send/")
    assert sent.status_code == 200, sent.json()
    assert sent.json()["status"] == "quotation"
    assert sent.json()["valid_until"] == str(TODAY + timedelta(days=30))

    confirmed = api.post(f"{url}/confirm/")
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"

    # The billing engine is live: activation bills the first period in the same transaction.
    activated = api.post(f"{url}/activate/")
    assert activated.status_code == 200, activated.json()
    assert activated.json()["status"] == "active"
    assert Invoice.objects.filter(subscription_id=subscription_id).count() == 1
    assert activated.json()["next_invoice_date"] > str(TODAY)

    paused = api.post(f"{url}/pause/")
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"

    resumed = api.post(f"{url}/resume/")
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "active"

    closed = api.post(f"{url}/close/", {"reason": "Customer moved"}, format="json")
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    assert closed.json()["close_reason"] == "Customer moved"

    renewed = api.post(f"{url}/renew/")
    assert renewed.status_code == 200, renewed.json()
    assert renewed.json()["status"] == "quotation"
    assert renewed.json()["renewed_from"] == subscription_id
    assert renewed.json()["lines"][0]["quantity"] == 5

    events = api.get(f"{url}/events/").json()["results"]
    assert [event["to_status"] for event in events] == [
        "quotation",
        "confirmed",
        "active",
        "paused",
        "active",
        "closed",
    ]
    assert events[-1]["note"] == "Customer moved"
    assert events[0]["actor"]["id"] == people.staff.pk


@needs_state_machine
def test_close_on_draft_cancels_with_reason(api, people, plan, term):
    subscription = make_subscription(people.asha_customer, plan, term)
    api.force_authenticate(people.staff)

    response = api.post(
        f"/api/subscriptions/{subscription.pk}/close/",
        {"reason": "Duplicate enquiry"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    assert response.json()["status"] == "closed"
    assert response.json()["close_reason"] == "Duplicate enquiry"

    events = api.get(f"/api/subscriptions/{subscription.pk}/events/").json()["results"]
    assert [(event["from_status"], event["to_status"]) for event in events] == [("draft", "closed")]


@needs_state_machine
def test_customer_portal_actions_are_plan_gated_and_scoped(api, people, plan, term):
    quotation = make_subscription(
        people.asha_customer, plan, term, status="quotation", valid_until=TODAY + timedelta(days=5)
    )
    make_subscription(
        people.other_customer, plan, term, status="quotation", valid_until=TODAY + timedelta(days=5)
    )
    api.force_authenticate(people.asha)

    detail = api.get(f"/api/subscriptions/{quotation.pk}/").json()
    assert detail["allowed_actions"] == ["confirm"]
    assert api.post(f"/api/subscriptions/{quotation.pk}/confirm/").json()["status"] == "confirmed"

    # Another customer's quotation is invisible (404), not 403.
    foreign = Subscription.objects.filter(customer=people.other_customer).first()
    assert api.post(f"/api/subscriptions/{foreign.pk}/confirm/").status_code == 404

    # Self-service only: sending is internal.
    draft = make_subscription(people.asha_customer, plan, term)
    assert api.post(f"/api/subscriptions/{draft.pk}/send/").status_code == 403

    paused_plan = Plan.objects.create(
        name="Pausable", price=0, start_date=TODAY - timedelta(days=5), pausable=False
    )
    active = make_subscription(people.asha_customer, paused_plan, term, status="active")
    blocked = api.post(f"/api/subscriptions/{active.pk}/pause/")
    assert blocked.status_code == 400
    assert blocked.json()["error"]["code"] == "invalid_transition"

    paused_plan.pausable = True
    paused_plan.save(update_fields=["pausable"])
    assert api.post(f"/api/subscriptions/{active.pk}/pause/").json()["status"] == "paused"
    # Whoever can pause can come back without emailing anyone.
    assert api.get(f"/api/subscriptions/{active.pk}/").json()["allowed_actions"] == [
        "resume",
        "close",
    ]
    assert api.post(f"/api/subscriptions/{active.pk}/resume/").json()["status"] == "active"

    closed_plan = Plan.objects.create(
        name="Non-closable", price=0, start_date=TODAY - timedelta(days=5), closable=False
    )
    active_two = make_subscription(people.asha_customer, closed_plan, term, status="active")
    assert api.post(f"/api/subscriptions/{active_two.pk}/close/").status_code == 400
    closed_plan.closable = True
    closed_plan.save(update_fields=["closable"])
    assert api.post(f"/api/subscriptions/{active_two.pk}/close/").json()["status"] == "closed"

    renewable_plan = Plan.objects.create(
        name="Renewable", price=0, start_date=TODAY - timedelta(days=5), renewable=True
    )
    closed = make_subscription(
        people.asha_customer,
        renewable_plan,
        term,
        status="closed",
        start_date=TODAY - timedelta(days=30),
        expiration_date=TODAY - timedelta(days=1),
    )
    renewed = api.post(f"/api/subscriptions/{closed.pk}/renew/")
    assert renewed.status_code == 200, renewed.json()
    assert renewed.json()["renewed_from"] == closed.pk
    assert renewed.json()["start_date"] == str(TODAY)


@needs_state_machine
def test_expired_quotation_cannot_be_confirmed(api, people, plan, term):
    quotation = make_subscription(
        people.asha_customer, plan, term, status="quotation", valid_until=TODAY - timedelta(days=1)
    )
    api.force_authenticate(people.asha)

    assert api.get(f"/api/subscriptions/{quotation.pk}/").json()["allowed_actions"] == []
    response = api.post(f"/api/subscriptions/{quotation.pk}/confirm/")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "quotation_expired"


@needs_state_machine
def test_events_timeline_is_scoped(api, people, plan, term):
    quotation = make_subscription(
        people.asha_customer, plan, term, status="quotation", valid_until=TODAY + timedelta(days=5)
    )
    api.force_authenticate(people.staff)
    api.post(f"/api/subscriptions/{quotation.pk}/confirm/")

    api.force_authenticate(people.asha)
    body = api.get(f"/api/subscriptions/{quotation.pk}/events/").json()
    assert body["count"] == 1
    event = body["results"][0]
    assert (event["from_status"], event["to_status"]) == ("quotation", "confirmed")
    assert event["actor"]["id"] == people.staff.pk

    api.force_authenticate(people.other)
    assert api.get(f"/api/subscriptions/{quotation.pk}/events/").status_code == 404
