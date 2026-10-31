"""Invoice generation. All monetary amounts are snapshotted in a transaction."""

from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from django.db import transaction

from apps.billing.models import DiscountRedemption, Invoice, InvoiceLine, InvoiceLineTax
from apps.catalog.models import Discount
from apps.core.audit import record
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


def run_due_billing(today, limit=500, triggered_by="manual"):
    """Scheduler integration will be implemented as the next billing feature."""
    raise NotImplementedError("Recurring billing runner is not implemented yet")
