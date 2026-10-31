from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.db.models import (
    BooleanField,
    Case,
    Count,
    DecimalField,
    Exists,
    F,
    IntegerField,
    Min,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, Least, TruncMonth

from apps.accounts.models import Customer
from apps.billing.models import Invoice, InvoiceStatus
from apps.payments.models import Payment
from apps.subscriptions.models import (
    Subscription,
    SubscriptionEvent,
    SubscriptionLine,
    SubscriptionStatus,
)


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
    first = date.today().replace(day=1)
    starts = [first - relativedelta(months=i) for i in range(months - 1, -1, -1)]

    def by_month(queryset, date_field, amount_field):
        rows = (
            queryset.filter(**{f"{date_field}__gte": starts[0]})
            .annotate(month=TruncMonth(date_field))
            .values("month")
            .annotate(total=Sum(amount_field))
        )
        return {row["month"]: row["total"] for row in rows}

    invoiced = by_month(
        Invoice.objects.filter(status__in=[InvoiceStatus.CONFIRMED, InvoiceStatus.PAID]),
        "invoice_date",
        "total",
    )
    collected = by_month(Payment.objects.all(), "payment_date", "amount")
    zero = Decimal("0.00")
    return [
        {
            "month": start.strftime("%Y-%m"),
            "invoiced": str(invoiced.get(start, zero)),
            "collected": str(collected.get(start, zero)),
        }
        for start in starts
    ]


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


AGING_BUCKETS = (("1-7", 1, 7), ("8-30", 8, 30), ("31-60", 31, 60), ("60+", 61, None))


def get_aging(today: date | None = None) -> list[dict]:
    """Overdue money by how late it is: the older the bucket, the less likely it's collected."""
    today = today or date.today()
    aggregates = {}
    for index, (_, first, last) in enumerate(AGING_BUCKETS):
        in_bucket = Q(due_date__lte=today - timedelta(days=first))
        if last is not None:
            in_bucket &= Q(due_date__gte=today - timedelta(days=last))
        aggregates[f"count_{index}"] = Count("id", filter=in_bucket)
        aggregates[f"amount_{index}"] = Sum(
            F("total") - F("amount_paid"), filter=in_bucket, output_field=DecimalField()
        )
    row = Invoice.objects.filter(status=InvoiceStatus.CONFIRMED).aggregate(**aggregates)
    return [
        {
            "bucket": label,
            "count": row[f"count_{index}"],
            "amount": str(row[f"amount_{index}"] or Decimal("0.00")),
        }
        for index, (label, _, _) in enumerate(AGING_BUCKETS)
    ]


def get_insights() -> list[dict]:
    """The ten active subscriptions most at risk of churn, each with its reasons (BILLING_RULES §7).

    Scored in the database: with thousands of active subscriptions, loading them to score in
    Python took six seconds.
    """
    today = date.today()
    overdue = Q(invoices__status=InvoiceStatus.CONFIRMED, invoices__due_date__lt=today)
    at_risk = (
        Subscription.objects.filter(status=SubscriptionStatus.ACTIVE)
        .annotate(
            overdue_count=Count("invoices", filter=overdue, distinct=True),
            oldest_due=Min("invoices__due_date", filter=overdue),
            was_paused=Exists(
                SubscriptionEvent.objects.filter(
                    subscription=OuterRef("pk"), to_status=SubscriptionStatus.PAUSED
                )
            ),
            renewed=Exists(Subscription.objects.filter(renewed_from=OuterRef("pk"))),
        )
        .annotate(
            expiring=Case(
                When(expiration_date__lte=today + timedelta(days=30), renewed=False, then=True),
                default=False,
                output_field=BooleanField(),
            )
        )
        .annotate(
            risk=Least(F("overdue_count") * 20, Value(40))
            + Case(When(was_paused=True, then=20), default=0, output_field=IntegerField())
            + Case(When(expiring=True, then=25), default=0, output_field=IntegerField())
        )
        .filter(risk__gt=0)
        .select_related("customer", "plan")
        .order_by("-risk", "oldest_due", "id")[:10]
    )

    results = []
    for sub in at_risk:
        reasons = []
        if sub.overdue_count:
            days = (today - sub.oldest_due).days
            reasons.append(f"{sub.overdue_count} overdue invoice(s), oldest {days} days past due")
        if sub.was_paused:
            reasons.append("Subscription was paused recently")
        if sub.expiring:
            reasons.append(f"Expiring on {sub.expiration_date} with no renewal")
        results.append(
            {
                "subscription_id": sub.id,
                "number": sub.number,
                "customer_name": sub.customer.name,
                "plan_name": sub.plan.name,
                "risk_score": min(sub.risk, 100),
                "reasons": reasons,
            }
        )
    return results


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
