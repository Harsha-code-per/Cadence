"""Foundation guarantees: DB constraints, numbering, password policy, error shape (M1)."""

from datetime import date

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.accounts.validators import CadencePasswordValidator
from apps.billing.models import Invoice
from apps.core.sequences import next_number


@pytest.mark.parametrize(
    ("password", "message"),
    [
        ("Abcdef!1", "Must be more than 8 characters."),  # exactly 8 is not "more than 8"
        ("abcdefgh!x", "Add an uppercase letter."),
        ("ABCDEFGH!X", "Add a lowercase letter."),
        ("Abcdefghij1", "Add a special character."),
    ],
)
def test_password_policy_rejects(password, message):
    with pytest.raises(ValidationError) as exc:
        CadencePasswordValidator().validate(password)
    assert message in exc.value.messages


def test_password_policy_accepts_strong_password():
    CadencePasswordValidator().validate("Abcdefgh!x")


def test_email_is_unique_case_insensitively(make_user):
    make_user("Asha@Example.test")
    assert User.objects.get_by_natural_key("ASHA@example.TEST").email == "asha@example.test"
    with pytest.raises(IntegrityError):
        make_user("asha@EXAMPLE.test")


@pytest.mark.django_db
def test_sequence_is_gapless_and_per_year():
    assert next_number("invoice", date(2026, 3, 1)) == "INV/2026/00001"
    assert next_number("invoice", date(2026, 3, 2)) == "INV/2026/00002"
    assert next_number("invoice", date(2027, 1, 1)) == "INV/2027/00001"


def _invoice(sub, number, status="draft", **overrides):
    values = dict(
        number=number,
        subscription=sub,
        customer=sub.customer,
        status=status,
        invoice_date=date(2026, 1, 1),
        due_date=date(2026, 1, 16),
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
        subtotal=100,
        discount_total=0,
        tax_total=18,
        total=118,
    )
    values.update(overrides)
    return Invoice.objects.create(**values)


def test_a_period_cannot_be_billed_twice(subscription):
    _invoice(subscription, "INV/2026/00001")
    with pytest.raises(IntegrityError), transaction.atomic():
        _invoice(subscription, "INV/2026/00002")


def test_cancelled_invoice_frees_its_period(subscription):
    _invoice(subscription, "INV/2026/00001", status="cancelled")
    assert _invoice(subscription, "INV/2026/00002").pk


@pytest.mark.parametrize(
    "overrides",
    [
        {"total": 999},  # total must equal subtotal - discount + tax
        {"amount_paid": 500},  # cannot pay more than the total
        {"status": "paid", "amount_paid": 10},  # paid means fully paid
        {"due_date": date(2025, 12, 1)},  # due before invoice date
    ],
)
def test_money_invariants_enforced_by_postgres(subscription, overrides):
    with pytest.raises(IntegrityError), transaction.atomic():
        _invoice(subscription, "INV/2026/00009", **overrides)


def test_health_is_public(api, db):
    response = api.get("/api/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_public_stats_has_no_personal_data(api, db):
    assert set(api.get("/api/public/stats/").json()) == {
        "active_subscriptions",
        "invoices_issued",
        "revenue_collected",
    }


def test_scheduler_endpoint_rejects_wrong_secret(api, db):
    response = api.post("/api/internal/billing/run/", HTTP_AUTHORIZATION="Bearer nope")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


def test_api_responses_carry_server_timing(api, db):
    header = api.get("/api/health/")["Server-Timing"]
    assert header.startswith("db;dur=") and 'desc="1 queries"' in header and "app;dur=" in header
