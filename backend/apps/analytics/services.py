from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.db.models import Case, Count, DecimalField, F, OuterRef, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce

from apps.accounts.models import Customer
from apps.billing.models import Invoice, InvoiceStatus
from apps.payments.models import Payment
from apps.subscriptions.models import Subscription, SubscriptionLine, SubscriptionStatus


def calculate_mrr(plan_id: int | None = None) -> Decimal:
    """Calculate Monthly Recurring Revenue (MRR) normalized across active subscriptions.

    Formula (BILLING_RULES §6):
    Σ over active subs of (plan.price + Σ line qty × unit_price) normalized to a month:
    - daily: × 30.4375
    - weekly: × (52 / 12)
    - monthly: × 1
    - yearly: ÷ 12
    all divided by plan.interval_count.
    Excludes discounts and taxes.
    """
    subs_qs = Subscription.objects.filter(status=SubscriptionStatus.ACTIVE)
    if plan_id:
        subs_qs = subs_qs.filter(plan_id=plan_id)

    # Subquery for sum of lines per subscription
    lines_subquery = (
        SubscriptionLine.objects.filter(subscription=OuterRef("pk"))
        .values("subscription")
        .annotate(total=Sum(F("quantity") * F("unit_price"), output_field=DecimalField()))
        .values("total")
    )

    multiplier_case = Case(
        When(plan__billing_period="daily", then=Value(Decimal("30.4375"))),
        When(plan__billing_period="weekly", then=Value(Decimal("52") / Decimal("12"))),
        When(plan__billing_period="monthly", then=Value(Decimal("1.00"))),
        When(plan__billing_period="yearly", then=Value(Decimal("1") / Decimal("12"))),
        default=Value(Decimal("1.00")),
        output_field=DecimalField(max_digits=12, decimal_places=4),
    )

    annotated = subs_qs.annotate(
        lines_total=Coalesce(Subquery(lines_subquery), Value(Decimal("0.00"))),
        period_multiplier=multiplier_case,
    ).annotate(
        sub_mrr=(F("plan__price") + F("lines_total"))
        * F("period_multiplier")
        / F("plan__interval_count")
    )

    agg = annotated.aggregate(total_mrr=Sum("sub_mrr"))
    result = agg.get("total_mrr") or Decimal("0.00")
    return round(result, 2)


def get_analytics_summary(
    from_date: date | None = None,
    to_date: date | None = None,
    plan_id: int | None = None,
) -> dict:
    today = date.today()

    subs_qs = Subscription.objects.filter(status=SubscriptionStatus.ACTIVE)
    if plan_id:
        subs_qs = subs_qs.filter(plan_id=plan_id)
    active_subscriptions = subs_qs.count()

    mrr = calculate_mrr(plan_id=plan_id)
    arr = mrr * Decimal("12")

    # Invoiced in range
    inv_qs = Invoice.objects.filter(status__in=[InvoiceStatus.CONFIRMED, InvoiceStatus.PAID])
    if plan_id:
        inv_qs = inv_qs.filter(subscription__plan_id=plan_id)
    if from_date:
        inv_qs = inv_qs.filter(invoice_date__gte=from_date)
    if to_date:
        inv_qs = inv_qs.filter(invoice_date__lte=to_date)
    invoiced = inv_qs.aggregate(total=Coalesce(Sum("total"), Value(Decimal("0.00"))))["total"]

    # Collected in range
    pay_qs = Payment.objects.all()
    if plan_id:
        pay_qs = pay_qs.filter(invoice__subscription__plan_id=plan_id)
    if from_date:
        pay_qs = pay_qs.filter(payment_date__gte=from_date)
    if to_date:
        pay_qs = pay_qs.filter(payment_date__lte=to_date)
    collected = pay_qs.aggregate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))))["total"]

    # Outstanding on open confirmed invoices
    open_inv = Invoice.objects.filter(status=InvoiceStatus.CONFIRMED)
    if plan_id:
        open_inv = open_inv.filter(subscription__plan_id=plan_id)
    outstanding = open_inv.aggregate(
        total=Coalesce(Sum(F("total") - F("amount_paid")), Value(Decimal("0.00")))
    )["total"]

    # Overdue open confirmed invoices
    overdue_qs = open_inv.filter(due_date__lt=today)
    overdue_agg = overdue_qs.aggregate(
        count=Count("id"),
        total=Coalesce(Sum(F("total") - F("amount_paid")), Value(Decimal("0.00"))),
    )

    return {
        "active_subscriptions": active_subscriptions,
        "mrr": str(mrr),
        "arr": str(arr),
        "invoiced": str(invoiced),
        "collected": str(collected),
        "outstanding": str(outstanding),
        "overdue_count": overdue_agg["count"],
        "overdue_amount": str(overdue_agg["total"]),
    }


def get_revenue_series(months: int = 12) -> list[dict]:
    """Return monthly invoiced vs collected revenue for the past N months."""
    months = min(max(months, 1), 36)
    today = date.today()
    series = []

    # Calculate month intervals from (months-1) back up to today
    for i in range(months - 1, -1, -1):
        target_month_date = today - relativedelta(months=i)
        start_date = date(target_month_date.year, target_month_date.month, 1)
        next_month = start_date + relativedelta(months=1)
        end_date = next_month - relativedelta(days=1)
        month_label = start_date.strftime("%Y-%m")

        invoiced = Invoice.objects.filter(
            status__in=[InvoiceStatus.CONFIRMED, InvoiceStatus.PAID],
            invoice_date__gte=start_date,
            invoice_date__lte=end_date,
        ).aggregate(total=Coalesce(Sum("total"), Value(Decimal("0.00"))))["total"]

        collected = Payment.objects.filter(
            payment_date__gte=start_date,
            payment_date__lte=end_date,
        ).aggregate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))))["total"]

        series.append(
            {
                "month": month_label,
                "invoiced": str(invoiced),
                "collected": str(collected),
            }
        )

    return series


def get_status_breakdown() -> dict:
    """Return count breakdown of subscriptions and invoices by status."""
    sub_counts = {choice[0]: 0 for choice in SubscriptionStatus.choices}
    for item in Subscription.objects.values("status").annotate(count=Count("id")):
        sub_counts[item["status"]] = item["count"]

    inv_counts = {choice[0]: 0 for choice in InvoiceStatus.choices}
    for item in Invoice.objects.values("status").annotate(count=Count("id")):
        inv_counts[item["status"]] = item["count"]

    return {
        "subscriptions": sub_counts,
        "invoices": inv_counts,
    }


def get_insights() -> list[dict]:
    """Rule-based churn risk score (0-100) and explanations for active subscriptions (BILLING_RULES §7)."""
    today = date.today()
    active_subs = (
        Subscription.objects.filter(status=SubscriptionStatus.ACTIVE)
        .select_related("customer", "plan")
        .prefetch_related("invoices", "events")
    )

    results = []
    for sub in active_subs:
        score = 0
        reasons = []

        # 1. Overdue invoices check
        overdue_invoices = [
            inv
            for inv in sub.invoices.all()
            if inv.status == InvoiceStatus.CONFIRMED and inv.due_date < today
        ]
        if overdue_invoices:
            count = len(overdue_invoices)
            score += min(count * 20, 40)
            max_days = max((today - inv.due_date).days for inv in overdue_invoices)
            reasons.append(f"{count} overdue invoice(s), oldest {max_days} days past due")

        # 2. Recent pause history
        pause_events = [e for e in sub.events.all() if e.to_status == SubscriptionStatus.PAUSED]
        if pause_events:
            score += 20
            reasons.append("Subscription was paused recently")

        # 3. Expiration within 30 days without renewal
        if (
            sub.expiration_date
            and (sub.expiration_date - today).days <= 30
            and not Subscription.objects.filter(renewed_from=sub).exists()
        ):
            score += 25
            reasons.append(f"Expiring on {sub.expiration_date} with no renewal")

        if score > 0:
            results.append(
                {
                    "subscription_id": sub.id,
                    "number": sub.number,
                    "customer_name": sub.customer.name,
                    "plan_name": sub.plan.name,
                    "risk_score": min(score, 100),
                    "reasons": reasons,
                }
            )

    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return results[:10]


def get_portal_summary(customer: Customer) -> dict:
    """Customer self-service portal summary."""
    active_subs = Subscription.objects.filter(customer=customer, status=SubscriptionStatus.ACTIVE)
    active_count = active_subs.count()

    # Next invoice date is the earliest next_invoice_date of active subs
    next_sub = (
        active_subs.filter(next_invoice_date__isnull=False).order_by("next_invoice_date").first()
    )
    next_invoice_date = str(next_sub.next_invoice_date) if next_sub else None

    # Total outstanding
    outstanding = Invoice.objects.filter(
        customer=customer, status=InvoiceStatus.CONFIRMED
    ).aggregate(total=Coalesce(Sum(F("total") - F("amount_paid")), Value(Decimal("0.00"))))["total"]

    recent_invoices = list(
        Invoice.objects.filter(customer=customer)
        .order_by("-invoice_date", "-id")[:5]
        .values("id", "number", "status", "invoice_date", "due_date", "total", "amount_paid")
    )
    for inv in recent_invoices:
        inv["total"] = str(inv["total"])
        inv["amount_paid"] = str(inv["amount_paid"])
        inv["outstanding"] = str(Decimal(inv["total"]) - Decimal(inv["amount_paid"]))

    recent_payments = list(
        Payment.objects.filter(invoice__customer=customer)
        .order_by("-payment_date", "-id")[:5]
        .values("id", "number", "method", "amount", "payment_date", "reference")
    )
    for p in recent_payments:
        p["amount"] = str(p["amount"])

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "company": customer.company,
            "email": customer.email,
        },
        "active_subscriptions": active_count,
        "next_invoice_date": next_invoice_date,
        "outstanding": str(outstanding),
        "recent_invoices": recent_invoices,
        "recent_payments": recent_payments,
    }


def get_pipeline() -> list[dict]:
    """Subscriptions per lifecycle stage with their recurring value (plan fee + lines).

    Two grouped aggregates (lines and plan fees) instead of one join, so a plan fee is
    never multiplied by the number of lines.
    """
    lines = {
        row["subscription__status"]: row["value"]
        for row in SubscriptionLine.objects.values("subscription__status").annotate(
            value=Sum(F("quantity") * F("unit_price"), output_field=DecimalField())
        )
    }
    stages = {
        row["status"]: row
        for row in Subscription.objects.values("status").annotate(
            count=Count("id"), plan_fees=Coalesce(Sum("plan__price"), Decimal("0"))
        )
    }
    return [
        {
            "status": status,
            "count": stages.get(status, {}).get("count", 0),
            "recurring_value": (lines.get(status) or Decimal("0"))
            + stages.get(status, {}).get("plan_fees", Decimal("0")),
        }
        for status in SubscriptionStatus.values
    ]
