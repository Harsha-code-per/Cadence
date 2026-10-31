"""Transactional subscription transitions; callers must not write status directly."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from apps.core.audit import record
from apps.core.sequences import next_number
from apps.subscriptions.models import (
    Subscription,
    SubscriptionEvent,
    SubscriptionLine,
    SubscriptionStatus,
)

ALLOWED_TRANSITIONS = {
    "send": {SubscriptionStatus.DRAFT: SubscriptionStatus.QUOTATION},
    "revise": {SubscriptionStatus.QUOTATION: SubscriptionStatus.DRAFT},
    "confirm": {SubscriptionStatus.QUOTATION: SubscriptionStatus.CONFIRMED},
    "activate": {SubscriptionStatus.CONFIRMED: SubscriptionStatus.ACTIVE},
    "pause": {SubscriptionStatus.ACTIVE: SubscriptionStatus.PAUSED},
    "resume": {SubscriptionStatus.PAUSED: SubscriptionStatus.ACTIVE},
    "close": {
        SubscriptionStatus.ACTIVE: SubscriptionStatus.CLOSED,
        SubscriptionStatus.PAUSED: SubscriptionStatus.CLOSED,
    },
    "cancel": {
        SubscriptionStatus.DRAFT: SubscriptionStatus.CLOSED,
        SubscriptionStatus.QUOTATION: SubscriptionStatus.CLOSED,
    },
    "auto_close": {
        SubscriptionStatus.ACTIVE: SubscriptionStatus.CLOSED,
        SubscriptionStatus.PAUSED: SubscriptionStatus.CLOSED,
    },
    "renew": {
        SubscriptionStatus.ACTIVE: SubscriptionStatus.QUOTATION,
        SubscriptionStatus.CLOSED: SubscriptionStatus.QUOTATION,
    },
}


class BillingUnavailable(APIException):
    status_code = 503
    default_detail = "Billing is not available yet; activation was not completed."
    default_code = "billing_unavailable"


def _invalid(message, code="invalid_transition"):
    raise ValidationError(message, code=code)


@transaction.atomic
def transition_subscription(subscription_id, action, *, actor=None, note="", today=None):
    """Lock and transition a subscription. Renewal returns the new subscription.

    Activation requires billing.services.generate_invoice(id, today); its failure
    rolls the transition back together with the invoice and audit entries.
    """
    today = today or timezone.localdate()
    sub = (
        Subscription.objects.select_for_update(of=("self",))
        .select_related("plan", "quotation_template")
        .get(pk=subscription_id)
    )
    target = ALLOWED_TRANSITIONS.get(action, {}).get(sub.status)
    if target is None:
        _invalid(f"Cannot {action} a subscription in {sub.status} status.")
    plan = sub.plan
    if action == "send":
        quantity = sub.lines.aggregate(total=Sum("quantity"))["total"] or 0
        if (
            not plan.is_active
            or plan.start_date > today
            or (plan.end_date and plan.end_date < today)
        ):
            _invalid("The plan is not available today.", "validation_error")
        if quantity < plan.min_quantity:
            _invalid("Add lines meeting the plan's minimum quantity.", "validation_error")
        days = sub.quotation_template.validity_days if sub.quotation_template else 30
        sub.valid_until = today + timedelta(days=days)
    elif action == "revise":
        sub.valid_until = None
    elif action == "confirm" and (not sub.valid_until or sub.valid_until < today):
        _invalid("The quotation has expired or has no validity date.", "quotation_expired")
    elif action == "activate" and sub.start_date > today:
        _invalid("The subscription start date has not arrived.", "validation_error")
    elif action == "pause" and not plan.pausable:
        _invalid("This plan cannot be paused.")
    elif action == "close" and not plan.closable:
        _invalid("This plan cannot be closed manually.")
    elif action == "auto_close" and (
        not plan.auto_close or not sub.expiration_date or sub.expiration_date >= today
    ):
        _invalid("This subscription is not eligible for automatic closure.")
    elif action == "renew" and not plan.renewable:
        _invalid("This plan cannot be renewed.")

    if action == "renew":
        renewal = Subscription.objects.create(
            number=next_number("subscription", today),
            customer=sub.customer,
            plan=plan,
            status=target,
            start_date=sub.expiration_date + timedelta(days=1) if sub.expiration_date else today,
            payment_term=sub.payment_term,
            quotation_template=sub.quotation_template,
            discount=sub.discount,
            salesperson=sub.salesperson,
            renewed_from=sub,
            notes=sub.notes,
            valid_until=today
            + timedelta(
                days=sub.quotation_template.validity_days if sub.quotation_template else 30
            ),
        )
        for line in sub.lines.prefetch_related("taxes"):
            copied = SubscriptionLine.objects.create(
                subscription=renewal,
                product=line.product,
                variant=line.variant,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
            )
            copied.taxes.set(line.taxes.all())
        SubscriptionEvent.objects.create(
            subscription=renewal, from_status="", to_status=target, actor=actor, note=note
        )
        record(actor, "subscription.renew", renewal, {"renewed_from": sub.pk, "to": target})
        return renewal

    previous = sub.status
    sub.status = target
    if action == "activate":
        sub.next_invoice_date = sub.start_date
    elif action == "resume":
        sub.next_invoice_date = max(sub.next_invoice_date or today, today)
    elif action in {"close", "cancel", "auto_close"}:
        sub.close_reason = note
    sub.save()
    SubscriptionEvent.objects.create(
        subscription=sub, from_status=previous, to_status=target, actor=actor, note=note
    )
    record(actor, f"subscription.{action}", sub, {"from": previous, "to": target})
    if action == "activate":
        from apps.billing import services

        generate_invoice = getattr(services, "generate_invoice", None)
        if generate_invoice is None:
            raise BillingUnavailable()
        if generate_invoice(sub.pk, today) is None:
            raise BillingUnavailable(
                "The first invoice could not be created; activation was rolled back."
            )
    return sub
