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
