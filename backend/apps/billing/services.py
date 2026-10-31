"""Invoice generation. All monetary amounts are snapshotted in a transaction."""

from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.db.models import F, Q

from apps.billing.models import BillingRun, DiscountRedemption, Invoice, InvoiceLine, InvoiceLineTax
from apps.catalog.models import Discount
from apps.core.audit import record
from apps.core.exceptions import DomainError
from apps.core.sequences import next_number
from apps.subscriptions.models import Subscription, SubscriptionStatus

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def rounded(value):
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def period_end(start, plan, anchor_day):
    """Return the inclusive period end, anchored to the subscription's start day."""
    units = {"daily": "days", "weekly": "weeks", "monthly": "months", "yearly": "years"}
    unit = units[plan.billing_period]
    delta = relativedelta(**{unit: plan.interval_count})
    if unit in {"months", "years"}:
        delta += relativedelta(day=anchor_day)
    return start + delta - timedelta(days=1)


@transaction.atomic
def generate_invoice(subscription_id, today):
    """Generate one due period and advance its cursor; return None when not due."""
    sub = (
        Subscription.objects.select_for_update(of=("self",))
        .select_related("plan", "payment_term")
        .get(pk=subscription_id)
    )
    start = sub.next_invoice_date
    if (
        sub.status != SubscriptionStatus.ACTIVE
        or not start
        or start > today
        or (sub.expiration_date and start > sub.expiration_date)
    ):
        return None
    end = period_end(start, sub.plan, sub.start_date.day)
    if (
        Invoice.objects.filter(subscription=sub, period_start=start)
        .exclude(status="cancelled")
        .exists()
    ):
        sub.next_invoice_date = end + timedelta(days=1)
        sub.save(update_fields=["next_invoice_date", "updated_at"])
        return None

    lines = []
    if sub.plan.price > 0:
        lines.append(
            {
                "product": None,
                "description": sub.plan.name,
                "quantity": 1,
                "unit_price": sub.plan.price,
                "taxes": list(sub.plan.taxes.all()),
            }
        )
    for line in sub.lines.select_related("product").prefetch_related("taxes"):
        lines.append(
            {
                "product": line.product,
                "description": line.description or line.product.name,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
                "taxes": list(line.taxes.all()),
            }
        )
    for line in lines:
        line["amount"] = rounded(line["unit_price"] * line["quantity"])
        line["discount"] = ZERO
    subtotal = sum((line["amount"] for line in lines), ZERO)
    quantity = sum(line["quantity"] for line in lines)
    discount = None
    if sub.discount_id:
        candidate = Discount.objects.select_for_update().get(pk=sub.discount_id)
        uses = candidate.redemptions.count()
        if (
            candidate.is_active
            and candidate.start_date <= start
            and (candidate.end_date is None or candidate.end_date >= start)
            and (candidate.usage_limit is None or uses < candidate.usage_limit)
            and subtotal >= candidate.min_amount
            and quantity >= candidate.min_quantity
        ):
            discount = candidate
    if discount:
        product_ids = (
            set(discount.products.values_list("id", flat=True))
            if discount.scope == "product"
            else None
        )
        eligible = [
            line
            for line in lines
            if product_ids is None
            or (line["product"] is not None and line["product"].pk in product_ids)
        ]
        eligible_total = sum((line["amount"] for line in eligible), ZERO)
        if discount.discount_type == "percent":
            for line in eligible:
                line["discount"] = min(
                    line["amount"], rounded(line["amount"] * discount.value / 100)
                )
        elif eligible_total:
            remaining = min(discount.value, eligible_total)
            # Allocate proportionally against the remaining amount and base, avoiding
            # negative remainders when several small rounded shares accumulate.
            remaining_base = eligible_total
            for line in eligible:
                share = (
                    min(
                        line["amount"],
                        remaining,
                        rounded(remaining * line["amount"] / remaining_base),
                    )
                    if remaining_base
                    else ZERO
                )
                line["discount"] = share
                remaining -= share
                remaining_base -= line["amount"]

    subtotal_discount = sum((line["discount"] for line in lines), ZERO)
    tax_total = ZERO
    for line in lines:
        line["tax_snapshots"] = [
            (tax, rounded((line["amount"] - line["discount"]) * tax.rate / 100))
            for tax in line["taxes"]
        ]
        line["tax_amount"] = sum((amount for _, amount in line["tax_snapshots"]), ZERO)
        tax_total += line["tax_amount"]
    invoice = Invoice.objects.create(
        number=next_number("invoice", start),
        subscription=sub,
        customer=sub.customer,
        status="draft",
        invoice_date=start,
        due_date=start + timedelta(days=sub.payment_term.due_days),
        period_start=start,
        period_end=end,
        subtotal=subtotal,
        discount_total=subtotal_discount,
        tax_total=tax_total,
        total=subtotal - subtotal_discount + tax_total,
        amount_paid=ZERO,
    )
    for line in lines:
        item = InvoiceLine.objects.create(
            invoice=invoice,
            product=line["product"],
            description=line["description"],
            quantity=line["quantity"],
            unit_price=line["unit_price"],
            amount=line["amount"],
            discount_amount=line["discount"],
            tax_amount=line["tax_amount"],
            total=line["amount"] - line["discount"] + line["tax_amount"],
        )
        InvoiceLineTax.objects.bulk_create(
            [
                InvoiceLineTax(line=item, tax=tax, name=tax.name, rate=tax.rate, amount=amount)
                for tax, amount in line["tax_snapshots"]
            ]
        )
    if discount and subtotal_discount > 0:
        DiscountRedemption.objects.create(
            discount=discount, invoice=invoice, amount=subtotal_discount
        )
    sub.next_invoice_date = end + timedelta(days=1)
    sub.save(update_fields=["next_invoice_date", "updated_at"])
    record(
        None,
        "invoice.generate",
        invoice,
        {"subscription": sub.pk, "period_start": start.isoformat()},
    )
    return invoice


@transaction.atomic
def generate_invoice_now(subscription_id, today):
    """Bill exactly one due period for one subscription, or explain why nothing was billed.

    A thin, lock-aware wrapper around generate_invoice for the manual
    POST /api/subscriptions/{id}/invoice-now/ action: the billing engine still
    decides eligibility and writes the invoice; this only turns "not billed"
    into a domain error the API can explain. Never catches up missed periods.
    """
    sub = (
        Subscription.objects.select_for_update(of=("self",))
        .select_related("plan", "payment_term")
        .get(pk=subscription_id)
    )
    start = sub.next_invoice_date
    if sub.status != SubscriptionStatus.ACTIVE:
        raise DomainError(
            "subscription_not_active",
            f"{sub.number} is {sub.get_status_display().lower()}; only active "
            "subscriptions can be invoiced.",
        )
    if start is None:
        raise DomainError(
            "invoice_not_due",
            f"{sub.number} has no billing period to invoice.",
        )
    if start > today:
        raise DomainError(
            "invoice_not_due",
            f"The next billing period for {sub.number} starts on "
            f"{start:%d %b %Y}; it is not due yet.",
        )
    if sub.expiration_date and start > sub.expiration_date:
        raise DomainError(
            "subscription_expired",
            f"{sub.number} expired on {sub.expiration_date:%d %b %Y}; a period starting "
            "after the expiration date is never invoiced.",
        )
    if (
        Invoice.objects.filter(subscription=sub, period_start=start)
        .exclude(status="cancelled")
        .exists()
    ):
        raise DomainError(
            "invoice_already_billed",
            f"The period starting {start:%d %b %Y} is already invoiced for {sub.number}.",
        )

    invoice = generate_invoice(subscription_id, today)
    if invoice is None:
        # The row changed between the checks above and the engine's own locked
        # re-check (e.g. a concurrent billing run). Nothing was written.
        raise DomainError(
            "invoice_not_due",
            f"No invoice was generated for {sub.number}; it is no longer due.",
        )
    return invoice


def run_due_billing(today, limit=500, triggered_by="manual", dry_run=False):
    """Process up to limit due subscriptions, catching up all their due periods.

    The batch retains its row locks until commit. Concurrent runners skip locked
    subscriptions; failures roll back the batch and its BillingRun record.
    A dry run executes the same code and rolls back all writes.
    """
    if limit < 1:
        raise ValueError("limit must be positive")
    from apps.subscriptions.state import transition_subscription

    due = Q(status=SubscriptionStatus.ACTIVE, next_invoice_date__lte=today) & (
        Q(expiration_date__isnull=True) | Q(next_invoice_date__lte=F("expiration_date"))
    )
    activate = Q(status=SubscriptionStatus.CONFIRMED, start_date__lte=today) & (
        Q(expiration_date__isnull=True) | Q(expiration_date__gte=today)
    )
    expire = Q(
        status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED],
        plan__auto_close=True,
        expiration_date__lt=today,
    )
    counts = {"activated": 0, "closed": 0, "invoiced": 0, "skipped": 0}
    with transaction.atomic():
        subscriptions = list(
            Subscription.objects.filter(due | activate | expire)
            .order_by("pk")
            .select_for_update(skip_locked=True, of=("self",))[:limit]
        )
        for sub in subscriptions:
            if (
                sub.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED)
                and sub.plan.auto_close
                and sub.expiration_date
                and sub.expiration_date < today
            ):
                transition_subscription(sub.pk, "auto_close", today=today, note="Plan expired")
                counts["closed"] += 1
                continue
            if sub.status == SubscriptionStatus.CONFIRMED:
                transition_subscription(sub.pk, "activate", today=today)
                counts["activated"] += 1
                counts["invoiced"] += 1
                sub.refresh_from_db()
            while (
                sub.status == SubscriptionStatus.ACTIVE
                and sub.next_invoice_date
                and sub.next_invoice_date <= today
                and (sub.expiration_date is None or sub.next_invoice_date <= sub.expiration_date)
            ):
                previous = sub.next_invoice_date
                invoice = generate_invoice(sub.pk, today)
                counts["invoiced" if invoice else "skipped"] += 1
                sub.refresh_from_db()
                if sub.next_invoice_date <= previous:
                    raise RuntimeError("Billing did not advance the subscription period")
        run = BillingRun.objects.create(run_date=today, triggered_by=triggered_by, **counts)
        result = {**counts, "ran_at": run.created_at.isoformat(), "dry_run": dry_run}
        if dry_run:
            transaction.set_rollback(True)
    return result
