from datetime import date, timedelta
from unittest.mock import patch

import pytest
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Product
from apps.subscriptions.models import Subscription, SubscriptionEvent, SubscriptionLine
from apps.subscriptions.state import BillingUnavailable, transition_subscription

TODAY = date(2026, 10, 31)


@pytest.fixture
def draft(subscription):
    subscription.status = "draft"
    subscription.start_date = TODAY
    subscription.save()
    product = Product.objects.create(name="Service", sales_price=10, cost_price=0)
    SubscriptionLine.objects.create(
        subscription=subscription, product=product, quantity=1, unit_price=10
    )
    return subscription


@pytest.mark.django_db
def test_lifecycle_and_activation_rollback(draft):
    transition_subscription(draft.pk, "send", today=TODAY)
    transition_subscription(draft.pk, "confirm", today=TODAY)
    with pytest.raises(BillingUnavailable):
        transition_subscription(draft.pk, "activate", today=TODAY)
    draft.refresh_from_db()
    assert draft.status == "confirmed"
    assert SubscriptionEvent.objects.filter(subscription=draft).count() == 2
    with patch(
        "apps.billing.services.generate_invoice", create=True, return_value=object()
    ) as billing:
        transition_subscription(draft.pk, "activate", today=TODAY)
    billing.assert_called_once_with(draft.pk, TODAY)
    draft.refresh_from_db()
    assert draft.status == "active" and draft.next_invoice_date == TODAY


@pytest.mark.django_db
def test_guards_and_expired_quotation(draft):
    with pytest.raises(ValidationError):
        transition_subscription(draft.pk, "pause", today=TODAY)
    transition_subscription(draft.pk, "send", today=TODAY)
    with pytest.raises(ValidationError):
        transition_subscription(draft.pk, "confirm", today=TODAY + timedelta(days=31))
    transition_subscription(draft.pk, "revise", today=TODAY)
    draft.refresh_from_db()
    assert draft.status == "draft" and draft.valid_until is None


@pytest.mark.django_db
def test_pause_close_and_renew(subscription):
    with pytest.raises(ValidationError):
        transition_subscription(subscription.pk, "pause", today=TODAY)
    subscription.plan.pausable = True
    subscription.plan.save()
    transition_subscription(subscription.pk, "pause", today=TODAY)
    transition_subscription(subscription.pk, "resume", today=TODAY)
    subscription.refresh_from_db()
    assert subscription.next_invoice_date == TODAY
    transition_subscription(subscription.pk, "close", today=TODAY, note="Requested")
    renewal = transition_subscription(subscription.pk, "renew", today=TODAY)
    assert renewal.status == "quotation" and renewal.renewed_from_id == subscription.pk
    assert Subscription.objects.get(pk=subscription.pk).close_reason == "Requested"
