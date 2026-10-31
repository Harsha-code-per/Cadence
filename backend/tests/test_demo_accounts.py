"""The demo password is public, so these accounts must not be able to change anything."""

import pytest
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.urls import get_resolver
from rest_framework.test import APIClient

from apps.accounts.models import Customer, Role, User
from apps.catalog.models import Tax
from apps.core.management.commands.create_demo_accounts import DEMO_PASSWORD


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def demo_admin(db):
    asha = User.objects.create_user("asha@raotraders.test", "x", full_name="Asha")
    Customer.objects.create(user=asha, name="Asha Rao", email="asha@raotraders.test")
    call_command("create_demo_accounts", verbosity=0)
    return User.objects.get(email="demo.admin@brightloop.test")


def _session(user):
    client = APIClient()
    client.force_login(user)  # a real session: the path judges take through the middleware
    return client


def test_demo_login_can_read(demo_admin):
    assert _session(demo_admin).get("/api/taxes/").status_code == 200


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/taxes/"),
        ("post", "/api/staff/"),
        ("post", "/api/customers/"),
        ("post", "/api/payments/"),
        ("post", "/api/billing/run/"),
        ("post", "/api/auth/change-password/"),
        ("patch", "/api/staff/1/"),
        ("delete", "/api/products/1/"),
        ("post", "/api/subscriptions/1/close/"),
        ("post", "/api/invoices/1/cancel/"),
    ],
)
def test_demo_login_cannot_write_anything(demo_admin, method, path):
    response = getattr(_session(demo_admin), method)(path, {"name": "hack"}, format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "demo_read_only"


def test_every_unsafe_route_is_covered_even_if_added_later(demo_admin):
    """Walks the real URL table, so a new endpoint can't slip past the chokepoint."""

    def paths(patterns, prefix=""):
        for entry in patterns:
            route = prefix + str(entry.pattern)
            if hasattr(entry, "url_patterns"):
                yield from paths(entry.url_patterns, route)
            else:
                yield route

    client = _session(demo_admin)
    checked = 0
    for route in paths(get_resolver().url_patterns):
        clean = route.replace("^", "").replace("$", "")
        if not clean.startswith("api/") or "(?P" in clean or "<" in clean:
            continue
        if clean in ("api/auth/login/", "api/auth/logout/"):
            continue
        assert client.post(f"/{clean}", {}, format="json").status_code == 403, clean
        checked += 1
    assert checked > 10


def test_demo_write_changes_nothing(demo_admin):
    _session(demo_admin).post("/api/taxes/", {"name": "Hack", "rate": "1.00"}, format="json")
    assert not Tax.objects.filter(name="Hack").exists()


def test_demo_billing_preview_is_allowed_but_rate_limited(demo_admin):
    client = _session(demo_admin)
    first = client.post("/api/billing/run/", {"dry_run": True}, format="json")
    assert first.status_code == 200 and first.json()["dry_run"] is True
    second = client.post("/api/billing/run/", {"dry_run": True}, format="json")
    assert second.status_code == 429


@pytest.mark.parametrize("body", [{"dry_run": "true"}, {"dry_run": False}, {}])
def test_only_a_strict_dry_run_counts_as_a_preview(demo_admin, body):
    response = _session(demo_admin).post("/api/billing/run/", body, format="json")
    assert response.status_code == 403


def test_demo_accounts_never_reach_the_django_admin(demo_admin):
    for user in User.objects.filter(is_demo=True):
        assert not user.is_staff and not user.is_superuser


def test_password_reset_is_silently_skipped_for_demo_accounts(api, demo_admin):
    response = api.post("/api/auth/password-reset/", {"email": demo_admin.email}, format="json")
    assert response.status_code == 204  # same answer as any other email
    assert mail.outbox == []


def test_strangers_cannot_lock_judges_out_of_the_demo(api, demo_admin):
    login = {"email": demo_admin.email, "password": "Wrong!Password1"}
    for _ in range(8):
        cache.delete("throttle_auth_127.0.0.1")
        api.post("/api/auth/login/", login, format="json")
    cache.clear()
    ok = api.post(
        "/api/auth/login/", {"email": demo_admin.email, "password": DEMO_PASSWORD}, format="json"
    )
    assert ok.status_code == 200
    assert ok.json()["is_demo"] is True


def test_real_accounts_are_unaffected(db, make_user):
    admin = make_user("real.admin@example.test", role=Role.ADMIN)
    response = _session(admin).post("/api/taxes/", {"name": "Real", "rate": "5.00"}, format="json")
    assert response.status_code == 201


def test_command_is_repeatable(demo_admin):
    call_command("create_demo_accounts", verbosity=0)
    assert User.objects.filter(is_demo=True).count() == 3
