import json
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import Role
from apps.billing.models import BillingRun, Invoice


@pytest.mark.django_db
def test_run_requires_admin_and_validates_input(api, make_user, subscription):
    staff = make_user(email="staff@example.test", role=Role.STAFF)
    customer = make_user(email="customer@example.test", role=Role.CUSTOMER)
    admin = make_user(email="admin@example.test", role=Role.ADMIN)
    for user in (staff, customer):
        api.force_authenticate(user)
        assert api.post("/api/billing/run/", {}, format="json").status_code == 403
    api.force_authenticate(admin)
    assert api.post("/api/billing/run/", {"date": "wrong"}, format="json").status_code == 400
    assert api.post("/api/billing/run/", {"limit": 0}, format="json").status_code == 400
    response = api.post("/api/billing/run/", {"date": "2026-01-01"}, format="json")
    assert response.status_code == 200 and response.data["invoiced"] == 1
    assert Invoice.objects.count() == 1


@pytest.mark.django_db
def test_last_run_access_and_dry_run(api, make_user, subscription):
    admin = make_user(email="admin@example.test", role=Role.ADMIN)
    staff = make_user(email="staff@example.test", role=Role.STAFF)
    customer = make_user(email="customer@example.test", role=Role.CUSTOMER)
    api.force_authenticate(admin)
    assert api.get("/api/billing/last-run/").data == {"last_run": None}
    response = api.post("/api/billing/run/", {"date": "2026-01-01", "dry_run": True}, format="json")
    assert response.data["invoiced"] == 1 and not BillingRun.objects.exists()
    api.post("/api/billing/run/", {"date": "2026-01-01"}, format="json")
    api.force_authenticate(staff)
    assert api.get("/api/billing/last-run/").data["last_run"]["invoiced"] == 1
    api.force_authenticate(customer)
    assert api.get("/api/billing/last-run/").status_code == 403


@pytest.mark.django_db
def test_command_supports_dry_run_and_rejects_bad_date(subscription):
    output = StringIO()
    call_command("run_billing", date="2026-01-01", dry_run=True, stdout=output)
    assert json.loads(output.getvalue())["invoiced"] == 1
    assert not Invoice.objects.exists()
    with pytest.raises(CommandError):
        call_command("run_billing", date="not-a-date")
