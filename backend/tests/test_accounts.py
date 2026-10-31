from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from apps.accounts.models import Customer, Role, User


def test_csrf_endpoint(api):
    response = api.get("/api/auth/csrf/")
    assert response.status_code == 200
    assert "csrf_token" in response.data
    assert response.data["status"] == "ok"


def test_signup_creates_customer_and_user(api, db):
    payload = {
        "full_name": "Test Customer",
        "email": "NewCustomer@Example.Com",
        "password": "Valid@Password123",
        "company": "Customer Co",
    }
    response = api.post("/api/auth/signup/", payload)
    assert response.status_code == 201
    assert response.data["email"] == "newcustomer@example.com"
    assert response.data["role"] == Role.CUSTOMER
    assert response.data["customer_id"] is not None

    user = User.objects.get(email="newcustomer@example.com")
    assert user.role == Role.CUSTOMER
    customer = Customer.objects.get(user=user)
    assert customer.name == "Test Customer"
    assert customer.company == "Customer Co"
    assert customer.email == "newcustomer@example.com"


def test_signup_duplicate_email_case_insensitive(api, make_user):
    make_user(email="existing@brightloop.test")
    payload = {
        "full_name": "Duplicate Person",
        "email": "Existing@Brightloop.Test",
        "password": "Valid@Password123",
    }
    response = api.post("/api/auth/signup/", payload)
    assert response.status_code == 400
    assert response.data["error"]["code"] == "validation_error"
    assert "email" in response.data["error"]["field_errors"]


def test_signup_weak_password_rejected(api, db):
    payload = {
        "full_name": "Weak User",
        "email": "weak@brightloop.test",
        "password": "weak",
    }
    response = api.post("/api/auth/signup/", payload)
    assert response.status_code == 400
    assert "password" in response.data["error"]["field_errors"]


def test_login_and_logout(api, make_user):
    user = make_user(email="alice@brightloop.test", role=Role.ADMIN)
    response = api.post(
        "/api/auth/login/",
        {"email": "Alice@brightloop.test", "password": "Str0ng!Password"},
    )
    assert response.status_code == 200
    assert response.data["id"] == user.id
    assert response.data["role"] == Role.ADMIN

    # Me view works with session
    me_response = api.get("/api/auth/me/")
    assert me_response.status_code == 200
    assert me_response.data["email"] == "alice@brightloop.test"

    # Logout
    logout_response = api.post("/api/auth/logout/")
    assert logout_response.status_code == 204

    # Me view now rejects
    me_after = api.get("/api/auth/me/")
    assert me_after.status_code == 401


def test_login_wrong_credentials(api, make_user):
    make_user(email="bob@brightloop.test")
    response = api.post(
        "/api/auth/login/",
        {"email": "bob@brightloop.test", "password": "WrongPassword!123"},
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_credentials"


def test_login_deactivated_account_rejected(api, make_user):
    make_user(email="inactive@brightloop.test", is_active=False)
    response = api.post(
        "/api/auth/login/",
        {"email": "inactive@brightloop.test", "password": "Str0ng!Password"},
    )
    assert response.status_code == 403
    assert response.data["error"]["code"] == "account_inactive"


def test_password_reset_flow(api, make_user):
    user = make_user(email="carol@brightloop.test")
    mail.outbox.clear()

    # Request reset
    response = api.post("/api/auth/password-reset/", {"email": "Carol@brightloop.test"})
    assert response.status_code == 204
    assert len(mail.outbox) == 1
    assert "reset-password" in mail.outbox[0].body

    # Unknown email also returns 204
    unknown_resp = api.post("/api/auth/password-reset/", {"email": "unknown@example.test"})
    assert unknown_resp.status_code == 204

    # Confirm reset
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)

    confirm_resp = api.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "New$trongPassword99"},
    )
    assert confirm_resp.status_code == 204

    # Token cannot be reused
    reuse_resp = api.post(
        "/api/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "Another$trongPassword1"},
    )
    assert reuse_resp.status_code == 400
    assert reuse_resp.data["error"]["code"] == "invalid_token"

    # User can log in with new password
    login_resp = api.post(
        "/api/auth/login/",
        {"email": "carol@brightloop.test", "password": "New$trongPassword99"},
    )
    assert login_resp.status_code == 200


def test_change_password(api, make_user):
    user = make_user(email="david@brightloop.test")
    api.force_authenticate(user=user)

    # Wrong old password
    bad_resp = api.post(
        "/api/auth/change-password/",
        {"old_password": "WrongOldPassword!1", "new_password": "NewPassword@123"},
    )
    assert bad_resp.status_code == 400
    assert bad_resp.data["error"]["code"] == "invalid_password"

    # Success
    good_resp = api.post(
        "/api/auth/change-password/",
        {"old_password": "Str0ng!Password", "new_password": "NewPassword@123"},
    )
    assert good_resp.status_code == 204

    user.refresh_from_db()
    assert user.check_password("NewPassword@123")


def test_staff_management_only_admin(api, make_user):
    admin = make_user(email="admin@brightloop.test", role=Role.ADMIN)
    staff = make_user(email="staff@brightloop.test", role=Role.STAFF)

    # Staff tries to list staff -> 403
    api.force_authenticate(user=staff)
    staff_resp = api.get("/api/staff/")
    assert staff_resp.status_code == 403

    # Staff tries to create staff -> 403
    create_bad = api.post(
        "/api/staff/",
        {
            "full_name": "New Guy",
            "email": "newguy@brightloop.test",
            "role": "staff",
            "password": "Password!999",
        },
    )
    assert create_bad.status_code == 403

    # Admin can list staff
    api.force_authenticate(user=admin)
    list_resp = api.get("/api/staff/")
    assert list_resp.status_code == 200
    assert any(u["email"] == "staff@brightloop.test" for u in list_resp.data["results"])

    # Admin creates staff
    create_good = api.post(
        "/api/staff/",
        {
            "full_name": "New Guy",
            "email": "NewGuy@brightloop.test",
            "role": "staff",
            "password": "Password!999",
        },
    )
    assert create_good.status_code == 201
    assert create_good.data["email"] == "newguy@brightloop.test"

    new_user = User.objects.get(email="newguy@brightloop.test")
    assert new_user.role == Role.STAFF

    # Admin deactivates staff
    del_resp = api.delete(f"/api/staff/{new_user.id}/")
    assert del_resp.status_code == 204
    new_user.refresh_from_db()
    assert new_user.is_active is False


def test_customer_scoping_prevents_bola(api, make_user, db):
    user_asha = make_user(email="asha@brightloop.test", role=Role.CUSTOMER)
    customer_asha = Customer.objects.create(user=user_asha, name="Asha", email=user_asha.email)

    user_rahul = make_user(email="rahul@brightloop.test", role=Role.CUSTOMER)
    customer_rahul = Customer.objects.create(user=user_rahul, name="Rahul", email=user_rahul.email)

    staff = make_user(email="staff2@brightloop.test", role=Role.STAFF)

    # Asha lists customers -> sees ONLY her own record
    api.force_authenticate(user=user_asha)
    asha_list = api.get("/api/customers/")
    assert asha_list.status_code == 200
    assert asha_list.data["count"] == 1
    assert asha_list.data["results"][0]["id"] == customer_asha.id

    # Asha tries to open Rahul's customer by ID -> 404 (not 403, preventing enumeration)
    asha_inspect_rahul = api.get(f"/api/customers/{customer_rahul.id}/")
    assert asha_inspect_rahul.status_code == 404

    # Staff sees all customers
    api.force_authenticate(user=staff)
    staff_list = api.get("/api/customers/")
    assert staff_list.status_code == 200
    assert staff_list.data["count"] >= 2
