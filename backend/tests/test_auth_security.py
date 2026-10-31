"""Security hardening: lockout, login CSRF, account claiming, admin self-protection."""

import pytest
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import Customer, Role, User
from tests.conftest import PASSWORD


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def _login(api, email, password):
    return api.post("/api/auth/login/", {"email": email, "password": password}, format="json")


def test_account_locks_after_five_failed_logins(api, make_user):
    make_user("victim@example.test")
    for _ in range(5):
        assert _login(api, "victim@example.test", "Wrong!Password1").status_code == 400
    locked = _login(api, "victim@example.test", PASSWORD)  # even the right password
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "too_many_attempts"


def test_successful_login_resets_the_failure_count(api, make_user):
    make_user("sam@example.test")
    for _ in range(4):
        _login(api, "sam@example.test", "Wrong!Password1")
    assert _login(api, "sam@example.test", PASSWORD).status_code == 200
    api.logout()
    for _ in range(4):
        _login(api, "sam@example.test", "Wrong!Password1")
    assert _login(api, "sam@example.test", PASSWORD).status_code == 200


def test_login_requires_a_csrf_token(db, make_user):
    make_user("csrf@example.test")
    strict = APIClient(enforce_csrf_checks=True)
    blocked = _login(strict, "csrf@example.test", PASSWORD)
    assert blocked.status_code == 403  # a cross-site form can't log a victim in
    assert blocked.json()["error"]["code"] == "csrf_failed"

    strict.get("/api/auth/csrf/")
    token = strict.cookies["csrftoken"].value
    ok = strict.post(
        "/api/auth/login/",
        {"email": "csrf@example.test", "password": PASSWORD},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert ok.status_code == 200


def test_signup_refuses_to_claim_an_existing_customer(api, db):
    Customer.objects.create(name="Rao Traders", email="accounts@rao.test")
    response = api.post(
        "/api/auth/signup/",
        {"full_name": "Mallory", "email": "Accounts@Rao.test", "password": "Str0ng!Passw0rd"},
        format="json",
    )
    assert response.status_code == 400
    assert "Forgot password" in response.json()["error"]["field_errors"]["email"][0]
    assert Customer.objects.get(email="accounts@rao.test").user is None


def test_forgot_password_lets_the_inbox_owner_claim_a_customer(api, db):
    customer = Customer.objects.create(name="Rao Traders", email="accounts@rao.test")
    assert (
        api.post(
            "/api/auth/password-reset/", {"email": "accounts@rao.test"}, format="json"
        ).status_code
        == 204
    )
    customer.refresh_from_db()
    assert customer.user is not None
    assert customer.user.role == Role.CUSTOMER
    assert not customer.user.has_usable_password()  # usable only after the emailed link
    assert len(mail.outbox) == 1 and "/reset-password/" in mail.outbox[0].body


def test_password_similar_to_email_is_rejected_at_signup(api, db):
    response = api.post(
        "/api/auth/signup/",
        {
            "full_name": "Brightloop Owner",
            "email": "brightloopowner@x.test",
            "password": "Brightloopowner!1",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "password" in response.json()["error"]["field_errors"]


def test_admin_cannot_demote_or_deactivate_themselves(api, make_user):
    admin = make_user("boss@example.test", role=Role.ADMIN)
    api.force_authenticate(admin)
    demote = api.patch(f"/api/staff/{admin.pk}/", {"role": "staff"}, format="json")
    assert demote.status_code == 400
    assert demote.json()["error"]["code"] == "cannot_modify_self"
    assert api.delete(f"/api/staff/{admin.pk}/").status_code == 400
    admin.refresh_from_db()
    assert admin.role == Role.ADMIN and admin.is_active


def test_promoting_staff_to_admin_grants_admin_site_access(api, make_user):
    admin = make_user("boss2@example.test", role=Role.ADMIN)
    staff = make_user("helper@example.test", role=Role.STAFF)
    api.force_authenticate(admin)
    assert api.patch(f"/api/staff/{staff.pk}/", {"role": "admin"}, format="json").status_code == 200
    staff.refresh_from_db()
    assert staff.is_staff


def test_staff_cannot_relink_a_customers_portal_login(api, make_user):
    staff = make_user("desk@example.test", role=Role.STAFF)
    intruder = make_user("intruder@example.test")
    customer = Customer.objects.create(name="Acme", email="acme@example.test")
    api.force_authenticate(staff)
    api.patch(f"/api/customers/{customer.pk}/", {"user": intruder.pk}, format="json")
    customer.refresh_from_db()
    assert customer.user is None


def test_django_admin_is_only_routed_when_enabled(settings):
    import importlib

    import config.urls

    settings.ENABLE_DJANGO_ADMIN = False
    routes = [str(p.pattern) for p in importlib.reload(config.urls).urlpatterns]
    assert "admin/" not in routes
    settings.ENABLE_DJANGO_ADMIN = True
    routes = [str(p.pattern) for p in importlib.reload(config.urls).urlpatterns]
    assert "admin/" in routes


def test_unknown_email_and_wrong_password_look_identical(api, make_user):
    make_user("real@example.test")
    unknown = _login(api, "ghost@example.test", "Wrong!Password1").json()
    wrong = _login(api, "real@example.test", "Wrong!Password1").json()
    assert unknown == wrong
    assert User.objects.filter(email="ghost@example.test").count() == 0
