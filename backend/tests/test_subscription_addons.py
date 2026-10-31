from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.billing.changes import invoice_changes
from apps.billing.services import generate_invoice
from apps.catalog.models import Product, Tax
from apps.subscriptions.models import SubscriptionEvent

pytestmark = pytest.mark.django_db
TODAY = date(2026, 1, 1)


@pytest.fixture
def owner(api, make_user, subscription):
    user = make_user("owner@example.test")
    subscription.customer.user = user
    subscription.customer.save()
    api.force_authenticate(user)
    return api


@pytest.fixture
def addon():
    product = Product.objects.create(
        name="Extra storage", product_type="addon", sales_price="20.00", cost_price="5.00"
    )
    product.taxes.add(Tax.objects.create(name="GST", rate=10))
    return product


def test_list_only_active_addons_and_no_cost(owner, subscription, addon):
    Product.objects.create(
        name="Hidden", product_type="addon", is_active=False, sales_price=1, cost_price=0
    )
    Product.objects.create(name="Service", sales_price=1, cost_price=0)
    response = owner.get(f"/api/subscriptions/{subscription.pk}/addons/")
    assert response.status_code == 200
    assert response.json() == [
        {"id": addon.pk, "name": addon.name, "sales_price": "20.00", "on": False}
    ]


def test_toggle_changes_future_invoices_and_preserves_snapshots(owner, subscription, addon):
    first = generate_invoice(subscription.pk, TODAY)
    url = f"/api/subscriptions/{subscription.pk}/addons/"
    assert owner.post(url, {"product": addon.pk}, format="json").status_code == 204
    assert owner.post(url, {"product": addon.pk}, format="json").status_code == 204
    line = subscription.lines.get(product=addon)
    assert line.quantity == 1 and line.unit_price == Decimal("20.00")
    assert list(line.taxes.all()) == list(addon.taxes.all())
    assert owner.get(url).json()[0]["on"] is True
    addon.sales_price = Decimal("30.00")
    addon.save(update_fields=["sales_price"])
    second = generate_invoice(subscription.pk, date(2026, 2, 1))
    assert not first.lines.filter(product=addon).exists()
    assert second.lines.get(product=addon).unit_price == Decimal("20.00")
    assert second.lines.get(product=addon).tax_amount == Decimal("2.00")
    assert any(
        c["kind"] == "line_added" and addon.name in c["description"]
        for c in invoice_changes(second)
    )
    assert owner.delete(f"{url}{addon.pk}/").status_code == 204
    assert not subscription.lines.filter(product=addon).exists()
    assert second.lines.filter(product=addon).exists()
    third = generate_invoice(subscription.pk, date(2026, 3, 1))
    assert any(
        c["kind"] == "line_removed" and addon.name in c["description"]
        for c in invoice_changes(third)
    )
    assert (
        SubscriptionEvent.objects.filter(
            subscription=subscription, note__contains="Extra storage"
        ).count()
        == 2
    )


@pytest.mark.parametrize("status", ["draft", "closed", "paused"])
def test_only_active_subscriptions_can_change_addons(owner, subscription, addon, status):
    subscription.status = status
    subscription.save()
    url = f"/api/subscriptions/{subscription.pk}/addons/"
    assert owner.post(url, {"product": addon.pk}, format="json").status_code == 400
    assert owner.delete(f"{url}{addon.pk}/").status_code == 400


def test_non_addon_refused(owner, subscription):
    product = Product.objects.create(name="Service", sales_price=1, cost_price=0)
    assert (
        owner.post(
            f"/api/subscriptions/{subscription.pk}/addons/", {"product": product.pk}, format="json"
        ).status_code
        == 400
    )


@pytest.mark.parametrize("role", ["admin", "staff"])
def test_internal_users_can_manage_addons(api, make_user, subscription, addon, role):
    api.force_authenticate(make_user(f"{role}@example.test", role=role))
    url = f"/api/subscriptions/{subscription.pk}/addons/"
    assert api.post(url, {"product": addon.pk}, format="json").status_code == 204
    assert api.delete(f"{url}{addon.pk}/").status_code == 204


def test_other_customer_cannot_access_addons(api, make_user, subscription, addon):
    api.force_authenticate(make_user("other@example.test"))
    url = f"/api/subscriptions/{subscription.pk}/addons/"
    assert api.get(url).status_code == 404
    assert api.post(url, {"product": addon.pk}, format="json").status_code == 404
    assert api.delete(f"{url}{addon.pk}/").status_code == 404


def test_demo_session_cannot_toggle_addons(subscription, addon, make_user):
    user = make_user("demo@example.test", role="admin", is_demo=True)
    client = APIClient()
    client.force_login(user)
    url = f"/api/subscriptions/{subscription.pk}/addons/"
    for response in (
        client.post(url, {"product": addon.pk}, format="json"),
        client.delete(f"{url}{addon.pk}/"),
    ):
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "demo_read_only"
    assert not subscription.lines.filter(product=addon).exists()
