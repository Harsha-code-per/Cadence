"""Subscription business rules: creation, edits, lines and lifecycle actions.

Views stay thin; every rule that moves state or money lives here (CONTRIBUTING §6).
The lifecycle itself belongs to apps.subscriptions.state (transition_subscription).
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.catalog.models import Product, ProductType
from apps.core.audit import record
from apps.core.exceptions import DomainError
from apps.core.sequences import next_number
from apps.subscriptions.models import (
    Subscription,
    SubscriptionEvent,
    SubscriptionLine,
    SubscriptionStatus,
)

# Portal actions (docs/API.md): everything else is admin/staff only.
CUSTOMER_ACTIONS = frozenset({"confirm", "pause", "resume", "close", "renew"})
EDITABLE_STATUSES = frozenset({SubscriptionStatus.DRAFT})


def _invalid(message, code="invalid_transition", field_errors=None):
    raise DomainError(code, message, field_errors=field_errors)


def _require_draft(subscription: Subscription, what: str = "Subscription details") -> None:
    if subscription.status not in EDITABLE_STATUSES:
        _invalid(
            f"{what} can only be edited while the subscription is a draft. "
            "Revise the quotation to draft first."
        )


def _check_line_values(quantity: int, unit_price: Decimal | None) -> None:
    if quantity < 1:
        _invalid(
            "Quantity must be at least 1.",
            code="validation_error",
            field_errors={"quantity": ["Quantity must be at least 1."]},
        )
    if unit_price is not None and unit_price < 0:
        _invalid(
            "Unit price cannot be negative.",
            code="validation_error",
            field_errors={"unit_price": ["Unit price cannot be negative."]},
        )


def _create_line(
    subscription: Subscription,
    *,
    product,
    quantity: int,
    variant=None,
    description: str = "",
    unit_price: Decimal | None = None,
    tax_ids=None,
) -> SubscriptionLine:
    """Create one line; unit price and taxes are snapshots (docs/DATA_MODEL.md)."""
    if variant is not None and variant.product_id != product.pk:
        _invalid(
            "This variant does not belong to the selected product.",
            code="validation_error",
            field_errors={"variant": ["This variant does not belong to the selected product."]},
        )
    _check_line_values(quantity, unit_price)
    if unit_price is None:
        unit_price = variant.price if variant else product.sales_price
    if not description:
        description = f"{product.name} ({variant.label})" if variant else product.name
    line = SubscriptionLine.objects.create(
        subscription=subscription,
        product=product,
        variant=variant,
        description=description,
        quantity=quantity,
        unit_price=unit_price,
    )
    # Absent tax_ids copies the product's defaults; an explicit [] means no tax.
    line.taxes.set(product.taxes.all() if tax_ids is None else tax_ids)
    return line


@transaction.atomic
def create_subscription(*, actor, lines=(), **fields) -> Subscription:
    """Create a draft with its lines. The number is issued when the draft is created."""
    subscription = Subscription.objects.create(
        number=next_number("subscription", timezone.localdate()),
        status=SubscriptionStatus.DRAFT,
        salesperson=actor,
        **fields,
    )
    for line_data in lines:
        _create_line(subscription, **line_data)
    record(actor, "subscription.create", subscription, {"lines": len(lines)})
    return subscription


@transaction.atomic
def create_from_template(*, actor, template, customer, start_date: date) -> Subscription:
    """Template → draft: copy the plan, payment term, notes and lines."""
    if template.payment_term_id is None:
        _invalid(
            "This quotation template has no payment term. Set one before using it.",
            code="validation_error",
            field_errors={"template": ["This template has no payment term."]},
        )
    subscription = Subscription.objects.create(
        number=next_number("subscription", timezone.localdate()),
        customer=customer,
        plan=template.plan,
        status=SubscriptionStatus.DRAFT,
        start_date=start_date,
        payment_term=template.payment_term,
        quotation_template=template,
        notes=template.notes,
        salesperson=actor,
    )
    template_lines = list(
        template.lines.select_related("product", "variant")
        .prefetch_related("variant__values")
        .all()
    )
    for template_line in template_lines:
        _create_line(
            subscription,
            product=template_line.product,
            variant=template_line.variant,
            quantity=template_line.quantity,
            description=template_line.description,
        )
    record(
        actor,
        "subscription.create",
        subscription,
        {"template": template.pk, "lines": len(template_lines)},
    )
    return subscription


@transaction.atomic
def update_subscription(subscription_id: int, *, actor, data: dict) -> Subscription:
    subscription = get_object_or_404(Subscription.objects.select_for_update(), pk=subscription_id)
    _require_draft(subscription)
    for field, value in data.items():
        setattr(subscription, field, value)
    if subscription.expiration_date and subscription.expiration_date < subscription.start_date:
        _invalid(
            "The expiration date cannot be before the start date.",
            code="validation_error",
            field_errors={
                "expiration_date": ["The expiration date cannot be before the start date."]
            },
        )
    subscription.save()
    record(actor, "subscription.update", subscription, {"fields": sorted(data)})
    return subscription


@transaction.atomic
def add_line(subscription_id: int, *, actor, data: dict) -> SubscriptionLine:
    subscription = get_object_or_404(Subscription.objects.select_for_update(), pk=subscription_id)
    _require_draft(subscription, "Subscription lines")
    line = _create_line(subscription, **data)
    record(
        actor,
        "subscription.line.add",
        subscription,
        {"line": line.pk, "product": line.product_id, "quantity": line.quantity},
    )
    return line


@transaction.atomic
def update_line(subscription_id: int, line_id: int, *, actor, data: dict) -> SubscriptionLine:
    subscription = get_object_or_404(Subscription.objects.select_for_update(), pk=subscription_id)
    _require_draft(subscription, "Subscription lines")
    line = get_object_or_404(subscription.lines.select_for_update(), pk=line_id)

    product = data.get("product", line.product)
    variant = data.get("variant", line.variant)
    if variant is not None and variant.product_id != product.pk:
        _invalid(
            "This variant does not belong to the selected product.",
            code="validation_error",
            field_errors={"variant": ["This variant does not belong to the selected product."]},
        )
    quantity = data.get("quantity", line.quantity)
    unit_price = data.get("unit_price", line.unit_price)
    _check_line_values(quantity, unit_price)

    line.product = product
    line.variant = variant
    line.quantity = quantity
    line.unit_price = unit_price
    line.description = data.get("description", line.description)
    line.save()
    if "tax_ids" in data:
        line.taxes.set(data["tax_ids"])
    record(
        actor,
        "subscription.line.update",
        subscription,
        {"line": line.pk, "fields": sorted(data)},
    )
    return line


@transaction.atomic
def remove_line(subscription_id: int, line_id: int, *, actor) -> None:
    subscription = get_object_or_404(Subscription.objects.select_for_update(), pk=subscription_id)
    _require_draft(subscription, "Subscription lines")
    line = get_object_or_404(subscription.lines, pk=line_id)
    line_pk = line.pk
    line.delete()
    record(actor, "subscription.line.remove", subscription, {"line": line_pk})


@transaction.atomic
def set_addon(subscription_id: int, product_id: int, *, enabled: bool, actor) -> None:
    """Change future billing lines while serializing changes with invoice generation."""
    subscription = get_object_or_404(Subscription.objects.select_for_update(), pk=subscription_id)
    if subscription.status != SubscriptionStatus.ACTIVE:
        _invalid("Add-ons can only be changed on an active subscription.")
    product = Product.objects.filter(pk=product_id, is_active=True).first()
    if product is None or product.product_type != ProductType.ADDON:
        _invalid(
            "Choose an active add-on.",
            code="validation_error",
            field_errors={"product": ["Choose an active add-on."]},
        )
    lines = subscription.lines.filter(product=product)
    if enabled and not lines.exists():
        _create_line(subscription, product=product, quantity=1)
    elif not enabled and lines.exists():
        lines.delete()
    else:
        return
    action = "enabled" if enabled else "disabled"
    SubscriptionEvent.objects.create(
        subscription=subscription,
        from_status=subscription.status,
        to_status=subscription.status,
        actor=actor,
        note=f"Add-on {product.name} {action}.",
    )
    record(actor, f"subscription.addon.{action}", subscription, {"product": product.pk})


def available_actions(subscription: Subscription, user, today: date | None = None) -> list[str]:
    """Actions the current user may take now; the UI renders exactly these buttons."""
    today = today or timezone.localdate()
    plan = subscription.plan
    status = subscription.status
    actions: list[str] = []

    if getattr(user, "is_internal", False):
        if status == SubscriptionStatus.DRAFT:
            actions = ["send", "close"]
        elif status == SubscriptionStatus.QUOTATION:
            actions = ["revise", "close"]
            if subscription.valid_until and subscription.valid_until >= today:
                actions.insert(0, "confirm")
        elif status == SubscriptionStatus.CONFIRMED:
            actions = ["activate"]
        elif status == SubscriptionStatus.ACTIVE:
            actions = [
                action
                for action, allowed in (
                    ("pause", plan.pausable),
                    ("close", plan.closable),
                    ("renew", plan.renewable),
                )
                if allowed
            ]
        elif status == SubscriptionStatus.PAUSED:
            actions = ["resume"] + (["close"] if plan.closable else [])
        elif status == SubscriptionStatus.CLOSED and plan.renewable:
            actions = ["renew"]
        return actions

    # Customer portal: confirm own quotation, then the plan-gated self-service actions.
    if (
        status == SubscriptionStatus.QUOTATION
        and subscription.valid_until
        and subscription.valid_until >= today
    ):
        actions.append("confirm")
    if status == SubscriptionStatus.ACTIVE:
        if plan.pausable:
            actions.append("pause")
        if plan.closable:
            actions.append("close")
        if plan.renewable:
            actions.append("renew")
    elif status == SubscriptionStatus.PAUSED:
        actions.append("resume")
        if plan.closable:
            actions.append("close")
    elif status == SubscriptionStatus.CLOSED and plan.renewable:
        actions.append("renew")
    return actions


def perform_action(
    subscription_id: int, action: str, *, actor, note: str = "", today: date | None = None
) -> Subscription:
    """Run one lifecycle action through the state machine.

    Renewal returns the new subscription; everything else returns the updated one.
    Activation raises a 503 billing_unavailable until the billing engine lands.
    """
    today = today or timezone.localdate()
    subscription = get_object_or_404(
        Subscription.objects.select_related("plan", "customer"), pk=subscription_id
    )
    internal = bool(getattr(actor, "is_internal", False))

    if not internal:
        if subscription.customer.user_id != actor.pk:
            raise PermissionDenied("You do not have access to this subscription.")
        if action not in CUSTOMER_ACTIONS:
            raise PermissionDenied("You cannot perform this action.")

    if (
        action == "confirm"
        and subscription.status == SubscriptionStatus.QUOTATION
        and (not subscription.valid_until or subscription.valid_until < today)
    ):
        raise DomainError(
            "quotation_expired", "The quotation has expired; ask staff to issue a new one."
        )

    if action not in available_actions(subscription, actor, today):
        _invalid(f"{action.title().replace('_', ' ')} is not available for this subscription.")

    # Staff/admin cancel a draft/quotation under the contract's single "close" action.
    state_action = (
        "cancel"
        if action == "close"
        and subscription.status in {SubscriptionStatus.DRAFT, SubscriptionStatus.QUOTATION}
        else action
    )

    # Imported lazily: the state-machine module lands in a parallel M3 PR.
    from apps.subscriptions.state import BillingUnavailable, transition_subscription

    try:
        return transition_subscription(
            subscription_id, state_action, actor=actor, note=note, today=today
        )
    except BillingUnavailable as exc:
        raise DomainError("billing_unavailable", str(exc.detail), http_status=503) from exc
