from datetime import date, timedelta
from decimal import Decimal

from apps.accounts.models import Customer, Role
from apps.analytics.services import calculate_mrr
from apps.billing.models import Invoice, InvoiceStatus
from apps.catalog.models import PaymentTerm, Plan, Product
from apps.payments.models import Payment, PaymentMethod
from apps.subscriptions.models import (
    Subscription,
    SubscriptionEvent,
    SubscriptionLine,
    SubscriptionStatus,
)


def test_mrr_calculation_across_billing_periods(db):
    term = PaymentTerm.objects.create(name="Immediate", due_days=0)
    customer = Customer.objects.create(name="Customer A", email="cust_a@example.test")
    product = Product.objects.create(
        name="CRM Seat", sales_price=Decimal("100.00"), cost_price=Decimal("10.00")
    )

    # 1. Monthly plan: price 500 + (2 * 100) = 700 / month
    p_monthly = Plan.objects.create(
        name="Monthly",
        price=Decimal("500.00"),
        billing_period="monthly",
        interval_count=1,
        start_date=date(2026, 1, 1),
    )
    sub1 = Subscription.objects.create(
        number="SUB/2026/00001",
        customer=customer,
        plan=p_monthly,
        payment_term=term,
        status=SubscriptionStatus.ACTIVE,
        start_date=date(2026, 1, 1),
    )
    SubscriptionLine.objects.create(
        subscription=sub1,
        product=product,
        description="Seat",
        quantity=2,
        unit_price=Decimal("100.00"),
    )

    # 2. Yearly plan: price 1200 / year = 100 / month
    p_yearly = Plan.objects.create(
        name="Yearly",
        price=Decimal("1200.00"),
        billing_period="yearly",
        interval_count=1,
        start_date=date(2026, 1, 1),
    )
    Subscription.objects.create(
        number="SUB/2026/00002",
        customer=customer,
        plan=p_yearly,
        payment_term=term,
        status=SubscriptionStatus.ACTIVE,
        start_date=date(2026, 1, 1),
    )

    # Total MRR = 700 + 100 = 800.00
    mrr = calculate_mrr()
    assert mrr == Decimal("800.00")


def test_analytics_summary_and_revenue_series_api(api, make_user, subscription):
    admin = make_user(email="admin@brightloop.test", role=Role.ADMIN)
    staff = make_user(email="staff@brightloop.test", role=Role.STAFF)
    customer_user = make_user(email="cust@brightloop.test", role=Role.CUSTOMER)

    # Admin access check
    api.force_authenticate(user=admin)
    assert api.get("/api/analytics/summary/").status_code == 200

    # Create confirmed and paid invoice
    inv = Invoice.objects.create(
        number="INV/2026/00001",
        subscription=subscription,
        customer=subscription.customer,
        status=InvoiceStatus.CONFIRMED,
        invoice_date=date.today() - timedelta(days=20),
        due_date=date.today() - timedelta(days=5),  # overdue: due_date < today and >= invoice_date
        period_start=date.today() - timedelta(days=20),
        period_end=date.today() + timedelta(days=10),
        subtotal=Decimal("1000.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("1000.00"),
        amount_paid=Decimal("400.00"),
    )
    Payment.objects.create(
        number="PAY/2026/00001",
        invoice=inv,
        method=PaymentMethod.UPI,
        amount=Decimal("400.00"),
        payment_date=date.today(),
    )

    # 1. Staff access summary
    api.force_authenticate(user=staff)
    summary_resp = api.get("/api/analytics/summary/")
    assert summary_resp.status_code == 200
    assert summary_resp.data["active_subscriptions"] >= 1
    assert Decimal(summary_resp.data["invoiced"]) >= Decimal("1000.00")
    assert Decimal(summary_resp.data["collected"]) >= Decimal("400.00")
    assert Decimal(summary_resp.data["outstanding"]) >= Decimal("600.00")
    assert summary_resp.data["overdue_count"] >= 1
    assert Decimal(summary_resp.data["overdue_amount"]) >= Decimal("600.00")

    # 2. Staff access revenue series
    series_resp = api.get("/api/analytics/revenue-series/?months=6")
    assert series_resp.status_code == 200
    assert len(series_resp.data) == 6
    current_month = date.today().strftime("%Y-%m")
    assert any(item["month"] == current_month for item in series_resp.data)

    # 3. Status breakdown
    breakdown_resp = api.get("/api/analytics/status-breakdown/")
    assert breakdown_resp.status_code == 200
    assert "subscriptions" in breakdown_resp.data
    assert "invoices" in breakdown_resp.data

    # 4. Customer blocked from internal analytics
    api.force_authenticate(user=customer_user)
    cust_blocked = api.get("/api/analytics/summary/")
    assert cust_blocked.status_code == 403


def test_insights_and_portal_summary(api, make_user, subscription):
    staff = make_user(email="staff@brightloop.test", role=Role.STAFF)
    customer_user = make_user(email="asha@raotraders.test", role=Role.CUSTOMER)
    customer = subscription.customer
    customer.user = customer_user
    customer.save()

    # Make subscription risky: overdue invoice + recent pause event
    Invoice.objects.create(
        number="INV/2026/00099",
        subscription=subscription,
        customer=customer,
        status=InvoiceStatus.CONFIRMED,
        invoice_date=date.today() - timedelta(days=20),
        due_date=date.today() - timedelta(days=10),
        period_start=date.today() - timedelta(days=20),
        period_end=date.today() + timedelta(days=10),
        subtotal=Decimal("500.00"),
        discount_total=Decimal("0.00"),
        tax_total=Decimal("0.00"),
        total=Decimal("500.00"),
        amount_paid=Decimal("0.00"),
    )
    SubscriptionEvent.objects.create(
        subscription=subscription,
        from_status=SubscriptionStatus.ACTIVE,
        to_status=SubscriptionStatus.PAUSED,
        note="Customer requested temporary hold",
    )

    # Staff checks insights
    api.force_authenticate(user=staff)
    insights_resp = api.get("/api/analytics/insights/")
    assert insights_resp.status_code == 200
    assert len(insights_resp.data) >= 1
    top_risk = insights_resp.data[0]
    assert top_risk["subscription_id"] == subscription.id
    assert top_risk["risk_score"] > 0
    assert len(top_risk["reasons"]) >= 1

    # Customer checks portal summary
    api.force_authenticate(user=customer_user)
    portal_resp = api.get("/api/portal/summary/")
    assert portal_resp.status_code == 200
    assert portal_resp.data["customer"]["id"] == customer.id
    assert portal_resp.data["active_subscriptions"] == 1
    assert Decimal(portal_resp.data["outstanding"]) >= Decimal("500.00")
    assert len(portal_resp.data["recent_invoices"]) >= 1


def test_pipeline_counts_and_values_each_stage_without_double_counting(api, make_user):
    staff = make_user("pipe-staff@example.test", role="staff")
    customer = Customer.objects.create(name="Pipe Co", email="pipe@example.test")
    plan = Plan.objects.create(name="Fee plan", price=100, start_date=date(2026, 1, 1))
    term = PaymentTerm.objects.create(name="Net 7", due_days=7)
    product = Product.objects.create(name="Seat", sales_price=10, cost_price=1)
    sub = Subscription.objects.create(
        number="SUB/2026/09001",
        customer=customer,
        plan=plan,
        payment_term=term,
        status="active",
        start_date=date(2026, 1, 1),
    )
    for qty in (2, 3):  # two lines must not double the plan fee
        SubscriptionLine.objects.create(
            subscription=sub, product=product, quantity=qty, unit_price=10
        )

    api.force_authenticate(staff)
    stages = {row["status"]: row for row in api.get("/api/analytics/pipeline/").json()}
    assert list(stages) == ["draft", "quotation", "confirmed", "active", "paused", "closed"]
    assert stages["active"]["count"] == 1
    assert stages["active"]["recurring_value"] == "150.00"  # 100 fee + 2×10 + 3×10
    assert stages["draft"] == {"status": "draft", "count": 0, "recurring_value": "0.00"}


def test_aging_buckets_use_outstanding_and_exclude_paid_and_future(api, make_user, subscription):
    today = date.today()

    def invoice(number, days_late, total="100.00", paid="0.00", status=InvoiceStatus.CONFIRMED):
        return Invoice.objects.create(
            number=number,
            subscription=subscription,
            customer=subscription.customer,
            status=status,
            invoice_date=today - timedelta(days=days_late + 15),
            due_date=today - timedelta(days=days_late),
            period_start=today - timedelta(days=days_late + 400),
            period_end=today - timedelta(days=days_late + 370),
            subtotal=Decimal(total),
            total=Decimal(total),
            amount_paid=Decimal(paid),
        )

    invoice("I1", 1, paid="40.00")
    invoice("I2", 7)
    invoice("I3", 8)
    invoice("I4", 31)
    invoice("I5", 61)
    invoice("I6", 0)  # due today: not late yet
    invoice("I7", -5)  # not due
    invoice("I8", 90, paid="100.00", status=InvoiceStatus.PAID)

    api.force_authenticate(make_user("staff@example.test", role=Role.STAFF))
    data = api.get("/api/analytics/aging/").json()
    assert [(row["bucket"], row["count"], Decimal(row["amount"])) for row in data] == [
        ("1-7", 2, Decimal("160.00")),
        ("8-30", 1, Decimal("100.00")),
        ("31-60", 1, Decimal("100.00")),
        ("60+", 1, Decimal("100.00")),
    ]
    assert [row["amount"] for row in data] == ["160.00", "100.00", "100.00", "100.00"]

    api.force_authenticate(make_user("c@example.test"))
    assert api.get("/api/analytics/aging/").status_code == 403


def test_insights_score_every_rule_and_rank_the_riskiest_first(
    api, make_user, subscription, django_assert_max_num_queries
):
    today = date.today()
    subscription.expiration_date = today + timedelta(days=10)
    subscription.save()
    SubscriptionEvent.objects.create(subscription=subscription, to_status="paused")
    for index, days_late in enumerate((5, 40, 90)):
        Invoice.objects.create(
            number=f"R{index}",
            subscription=subscription,
            customer=subscription.customer,
            status=InvoiceStatus.CONFIRMED,
            invoice_date=today - timedelta(days=days_late + 15),
            due_date=today - timedelta(days=days_late),
            period_start=today - timedelta(days=500 + index * 31),
            period_end=today - timedelta(days=470 + index * 31),
            subtotal=Decimal("10.00"),
            total=Decimal("10.00"),
        )
    Subscription.objects.create(
        number="SUB/SAFE",
        customer=subscription.customer,
        plan=subscription.plan,
        payment_term=subscription.payment_term,
        status="active",
        start_date=today,
    )

    api.force_authenticate(make_user("staff@example.test", role=Role.STAFF))
    with django_assert_max_num_queries(6):
        data = api.get("/api/analytics/insights/").json()

    assert len(data) == 1  # the healthy subscription isn't listed
    assert data[0]["risk_score"] == 85  # overdue capped at 40, pause 20, expiring 25
    assert data[0]["reasons"][0] == "3 overdue invoice(s), oldest 90 days past due"
    assert len(data[0]["reasons"]) == 3
