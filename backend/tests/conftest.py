from datetime import date

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Customer, Role, User
from apps.catalog.models import PaymentTerm, Plan
from apps.subscriptions.models import Subscription

PASSWORD = "Str0ng!Password"


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def make_user(db):
    def _make(email="user@example.test", role=Role.CUSTOMER, **extra):
        return User.objects.create_user(email, PASSWORD, full_name="Test User", role=role, **extra)

    return _make


@pytest.fixture
def subscription(db):
    """A minimal active subscription other tests can bill against."""
    customer = Customer.objects.create(name="Acme", email="billing@acme.test")
    plan = Plan.objects.create(name="Monthly", price=100, start_date=date(2026, 1, 1))
    term = PaymentTerm.objects.create(name="Net 15", due_days=15)
    return Subscription.objects.create(
        number="SUB/2026/00001",
        customer=customer,
        plan=plan,
        payment_term=term,
        status="active",
        start_date=date(2026, 1, 1),
        next_invoice_date=date(2026, 1, 1),
    )
