from datetime import date

import pytest

from apps.billing.models import BillingRun, Invoice
from apps.billing.services import generate_invoice, run_due_billing
from apps.subscriptions.models import SubscriptionEvent


@pytest.mark.django_db
def test_catch_up_and_repeat_run(subscription):
    result = run_due_billing(date(2026, 3, 1))
    assert result["invoiced"] == 3
    assert list(
        Invoice.objects.order_by("period_start").values_list("period_start", flat=True)
    ) == [date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1)]
    assert run_due_billing(date(2026, 3, 1))["invoiced"] == 0
    assert Invoice.objects.count() == 3
    assert BillingRun.objects.count() == 2


@pytest.mark.django_db
def test_existing_period_is_skipped_and_cursor_advances(subscription):
    generate_invoice(subscription.pk, date(2026, 1, 1))
    subscription.next_invoice_date = date(2026, 1, 1)
    subscription.save(update_fields=["next_invoice_date"])
    result = run_due_billing(date(2026, 2, 1))
    assert result["skipped"] == 1 and result["invoiced"] == 1
    assert Invoice.objects.count() == 2


@pytest.mark.django_db
def test_dry_run_rolls_back_all_writes(subscription):
    result = run_due_billing(date(2026, 2, 1), dry_run=True)
    subscription.refresh_from_db()
    assert result["invoiced"] == 2 and result["dry_run"] is True
    assert subscription.next_invoice_date == date(2026, 1, 1)
    assert not Invoice.objects.exists()
    assert not BillingRun.objects.exists()


@pytest.mark.django_db
def test_activate_and_catch_up(subscription):
    subscription.status = "confirmed"
    subscription.next_invoice_date = None
    subscription.save()
    result = run_due_billing(date(2026, 2, 1))
    subscription.refresh_from_db()
    assert result["activated"] == 1 and result["invoiced"] == 2
    assert subscription.status == "active"
    assert SubscriptionEvent.objects.filter(subscription=subscription, to_status="active").exists()


@pytest.mark.django_db
def test_expired_subscription_bills_final_period_before_closing(subscription):
    subscription.plan.auto_close = True
    subscription.plan.save()
    subscription.expiration_date = date(2026, 1, 31)
    subscription.save()
    result = run_due_billing(date(2026, 2, 1))
    subscription.refresh_from_db()
    assert result["closed"] == 1 and result["invoiced"] == 1
    assert subscription.status == "closed"
    assert list(Invoice.objects.values_list("period_start", flat=True)) == [date(2026, 1, 1)]


@pytest.mark.django_db
def test_plan_end_closes_after_billing_all_due_periods(subscription):
    subscription.plan.auto_close = True
    subscription.plan.end_date = date(2026, 2, 15)
    subscription.plan.save()
    result = run_due_billing(date(2026, 3, 1))
    subscription.refresh_from_db()
    assert result["closed"] == 1 and result["invoiced"] == 2
    assert subscription.status == "closed"
    assert list(
        Invoice.objects.order_by("period_start").values_list("period_start", flat=True)
    ) == [date(2026, 1, 1), date(2026, 2, 1)]


@pytest.mark.django_db
def test_plan_end_does_not_stop_billing_without_auto_close(subscription):
    subscription.plan.auto_close = False
    subscription.plan.end_date = date(2026, 1, 31)
    subscription.plan.save()
    result = run_due_billing(date(2026, 2, 1))
    subscription.refresh_from_db()
    assert result["closed"] == 0 and result["invoiced"] == 2
    assert subscription.status == "active"


@pytest.mark.django_db
def test_subscription_expiration_takes_precedence_over_plan_end(subscription):
    subscription.plan.auto_close = True
    subscription.plan.end_date = date(2026, 1, 31)
    subscription.plan.save()
    subscription.expiration_date = date(2026, 2, 28)
    subscription.save()
    result = run_due_billing(date(2026, 2, 1))
    subscription.refresh_from_db()
    assert result["closed"] == 0 and result["invoiced"] == 2
    assert subscription.status == "active"
