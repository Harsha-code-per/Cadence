from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
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
    with (
        patch("apps.billing.services.generate_invoice", return_value=None),
        pytest.raises(BillingUnavailable),
    ):
        transition_subscription(draft.pk, "activate", today=TODAY)
    draft.refresh_from_db()
    assert draft.status == "confirmed"
    assert SubscriptionEvent.objects.filter(subscription=draft).count() == 2
    transition_subscription(draft.pk, "activate", today=TODAY)
    draft.refresh_from_db()
    assert draft.status == "active" and draft.invoices.count() == 1


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
    # The shared fixture inserts its number directly, without advancing Sequence.
    subscription.number = "SUB/2025/00001"
    subscription.save(update_fields=["number"])
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


def test_resume_shifts_billing_by_the_paused_days_and_keeps_full_periods(subscription):
    from apps.billing.services import generate_invoice

    subscription.plan.pausable = True
    subscription.plan.save()
    subscription.next_invoice_date = date(2026, 3, 1)
    subscription.save()

    transition_subscription(subscription.pk, "pause", today=date(2026, 2, 10))
    SubscriptionEvent.objects.filter(to_status="paused").update(
        created_at=timezone.make_aware(datetime(2026, 2, 10, 12))
    )
    transition_subscription(subscription.pk, "resume", today=date(2026, 2, 20))
    subscription.refresh_from_db()
    assert subscription.next_invoice_date == date(2026, 3, 11)

    # The next period is a whole month from the new date, not cut short by the old anchor.
    invoice = generate_invoice(subscription.pk, date(2026, 3, 11))
    assert (invoice.period_start, invoice.period_end) == (date(2026, 3, 11), date(2026, 4, 10))
    subscription.refresh_from_db()
    assert subscription.next_invoice_date == date(2026, 4, 11)
    assert date(2026, 4, 10) + timedelta(days=1) == subscription.next_invoice_date
