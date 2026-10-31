"""Realistic Brightloop demo data, bulk-inserted so 5k subscriptions seed in seconds.

    python manage.py seed_demo                      # ~300 subscriptions
    python manage.py seed_demo --subscriptions 5000 # performance dataset
    python manage.py seed_demo --fresh              # wipe business data first

Historic invoices are written directly (plan fee + lines + line taxes, no discounts) so
the dataset is large and fast to create; every row satisfies the DB CHECK constraints.
Live demo invoices come from the real billing engine: ~5% of active subscriptions are
left due today so "Run billing now" has work to do.
"""

import os
import random
from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Customer, Role, User
from apps.billing.models import Invoice, InvoiceLine, InvoiceLineTax, InvoiceStatus
from apps.catalog.models import (
    Attribute,
    AttributeValue,
    Discount,
    PaymentTerm,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    QuotationTemplateLine,
    Tax,
)
from apps.core.models import AuditLog, Sequence
from apps.payments.models import Payment, PaymentMethod
from apps.subscriptions.models import (
    Subscription,
    SubscriptionEvent,
    SubscriptionLine,
    SubscriptionStatus,
)

CENT = Decimal("0.01")
STEP = {
    "daily": relativedelta(days=1),
    "weekly": relativedelta(weeks=1),
    "monthly": relativedelta(months=1),
    "yearly": relativedelta(years=1),
}
FIRST = [
    "Asha",
    "Rohan",
    "Meera",
    "Kabir",
    "Ishaan",
    "Diya",
    "Arjun",
    "Nisha",
    "Vikram",
    "Ananya",
    "Rahul",
    "Sneha",
    "Karthik",
    "Pooja",
    "Aditya",
    "Lakshmi",
    "Farhan",
    "Tara",
    "Dev",
    "Zoya",
]  # noqa: E501
LAST = [
    "Rao",
    "Sharma",
    "Iyer",
    "Khan",
    "Gupta",
    "Menon",
    "Reddy",
    "Das",
    "Nair",
    "Bose",
    "Patel",
    "Singh",
    "Joshi",
    "Pillai",
    "Kapoor",
]
COMPANY = [
    "Traders",
    "Foods",
    "Logistics",
    "Studio",
    "Clinics",
    "Retail",
    "Labs",
    "Textiles",
    "Motors",
    "Pharma",
    "Builders",
    "Exports",
    "Academy",
    "Hotels",
    "Agro",
]  # noqa: E501


def q(value: Decimal) -> Decimal:
    return value.quantize(CENT, ROUND_HALF_UP)


class Command(BaseCommand):
    help = "Seed realistic demo data (users, catalog, customers, subscriptions, invoices)."

    def add_arguments(self, parser):
        parser.add_argument("--subscriptions", type=int, default=300)
        parser.add_argument("--fresh", action="store_true", help="Delete business data first")
        parser.add_argument("--seed", type=int, default=7, help="Random seed (reproducible)")

    @transaction.atomic
    def handle(self, *args, subscriptions: int, fresh: bool, seed: int, **options):
        rng = random.Random(seed)
        if fresh:
            self._wipe()
        elif Plan.objects.exists():
            self.stdout.write(self.style.WARNING("Already seeded. Use --fresh to start over."))
            return

        today = date.today()
        password = os.environ.get("DEMO_PASSWORD", "Brightloop@2026")
        users = self._users(password)
        catalog = self._catalog(today)
        customers = self._customers(max(20, subscriptions // 3), users, rng)
        self._subscriptions(subscriptions, customers, catalog, users, today, rng)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {Subscription.objects.count()} subscriptions, "
                f"{Invoice.objects.count()} invoices, {Payment.objects.count()} payments. "
                f"Log in as admin@brightloop.test / staff@brightloop.test / "
                f"asha@raotraders.test with DEMO_PASSWORD."
            )
        )

    # ------------------------------------------------------------------ helpers
    def _wipe(self):
        for model in (Payment, Invoice, SubscriptionEvent, Subscription, Customer, AuditLog):
            model.objects.all().delete()
        for model in (QuotationTemplate, Discount, Plan, ProductVariant, Product, Attribute):
            model.objects.all().delete()
        Tax.objects.all().delete()
        PaymentTerm.objects.all().delete()
        Sequence.objects.all().delete()
        User.objects.filter(email__endswith=".test").delete()

    def _users(self, password):
        admin = User.objects.create_superuser(
            "admin@brightloop.test", password, full_name="Aarav Mehta"
        )
        staff = User.objects.create_user(
            "staff@brightloop.test", password, full_name="Priya Nair", role=Role.STAFF
        )
        asha = User.objects.create_user(
            "asha@raotraders.test", password, full_name="Asha Rao", role=Role.CUSTOMER
        )
        return {"admin": admin, "staff": staff, "asha": asha}

    def _catalog(self, today):
        gst18 = Tax.objects.create(name="GST 18%", rate=Decimal("18.00"))
        gst5 = Tax.objects.create(name="GST 5%", rate=Decimal("5.00"))
        terms = {
            "now": PaymentTerm.objects.create(name="Immediate", due_days=0),
            "n15": PaymentTerm.objects.create(name="Net 15", due_days=15),
            "n30": PaymentTerm.objects.create(name="Net 30", due_days=30),
        }
        brand = Attribute.objects.create(name="Brand")
        odoo = AttributeValue.objects.create(attribute=brand, name="Odoo", extra_price=560)
        own = AttributeValue.objects.create(attribute=brand, name="Brightloop", extra_price=0)
        edition = Attribute.objects.create(name="Edition")
        std = AttributeValue.objects.create(attribute=edition, name="Standard", extra_price=0)
        ent = AttributeValue.objects.create(attribute=edition, name="Enterprise", extra_price=1500)

        specs = [
            ("Brightloop CRM", "service", 1200, 300, gst18),
            ("Brightloop Books", "service", 900, 200, gst18),
            ("Brightloop Helpdesk", "service", 700, 150, gst18),
            ("Analytics add-on", "addon", 400, 80, gst18),
            ("Extra storage 100 GB", "addon", 250, 60, gst18),
            ("Priority support", "addon", 1500, 600, gst18),
            ("Barcode scanner", "goods", 3500, 2200, gst5),
        ]
        products = {}
        for name, kind, price, cost, tax in specs:
            p = Product.objects.create(
                name=name, product_type=kind, sales_price=price, cost_price=cost
            )
            p.taxes.add(tax)
            products[name] = p

        crm_odoo = ProductVariant.objects.create(product=products["Brightloop CRM"], sku="CRM-ODOO")
        crm_odoo.values.add(odoo)
        ProductVariant.objects.create(product=products["Brightloop CRM"], sku="CRM-BL").values.add(
            own
        )
        ProductVariant.objects.create(
            product=products["Brightloop Books"], sku="BOOKS-STD"
        ).values.add(std)
        books_ent = ProductVariant.objects.create(
            product=products["Brightloop Books"], sku="BOOKS-ENT"
        )
        books_ent.values.add(ent)

        start = today - timedelta(days=800)
        plans = {
            "starter": Plan.objects.create(
                name="Starter monthly",
                price=0,
                billing_period="monthly",
                start_date=start,
                pausable=True,
                closable=True,
            ),
            "growth": Plan.objects.create(
                name="Growth monthly",
                price=499,
                billing_period="monthly",
                start_date=start,
                pausable=True,
                closable=True,
            ),
            "business": Plan.objects.create(
                name="Business yearly",
                price=4999,
                billing_period="yearly",
                min_quantity=5,
                start_date=start,
                auto_close=True,
                closable=False,
                renewable=True,
            ),
            "weekly": Plan.objects.create(
                name="Weekly sprint",
                price=199,
                billing_period="weekly",
                start_date=start,
                closable=True,
            ),
            "quarterly": Plan.objects.create(
                name="Quarterly team",
                price=999,
                billing_period="monthly",
                interval_count=3,
                start_date=start,
                pausable=True,
            ),
        }
        for plan in plans.values():
            plan.taxes.add(gst18)

        Discount.objects.create(
            name="Bulk seats 10%",
            discount_type="percent",
            value=10,
            min_quantity=10,
            start_date=start,
            usage_limit=100,
        )
        launch = Discount.objects.create(
            name="CRM launch ₹500 off",
            code="LAUNCH500",
            discount_type="fixed",
            value=500,
            scope="product",
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=60),
            usage_limit=3,
        )
        launch.products.add(products["Brightloop CRM"])
        Discount.objects.create(
            name="Festive 15% (expired)",
            discount_type="percent",
            value=15,
            start_date=today - timedelta(days=90),
            end_date=today - timedelta(days=30),
        )

        growth_tpl = QuotationTemplate.objects.create(
            name="Growth CRM bundle",
            validity_days=15,
            plan=plans["growth"],
            payment_term=terms["n15"],
        )
        QuotationTemplateLine.objects.bulk_create(
            [
                QuotationTemplateLine(
                    template=growth_tpl,
                    product=products["Brightloop CRM"],
                    variant=crm_odoo,
                    quantity=5,
                ),
                QuotationTemplateLine(
                    template=growth_tpl, product=products["Analytics add-on"], quantity=5
                ),
            ]
        )
        suite_tpl = QuotationTemplate.objects.create(
            name="Business suite yearly",
            validity_days=30,
            plan=plans["business"],
            payment_term=terms["n30"],
        )
        QuotationTemplateLine.objects.bulk_create(
            [
                QuotationTemplateLine(template=suite_tpl, product=products[n], quantity=10)
                for n in ("Brightloop CRM", "Brightloop Books", "Brightloop Helpdesk")
            ]
        )
        return {
            "products": products,
            "plans": plans,
            "terms": terms,
            "variants": {"crm_odoo": crm_odoo, "books_ent": books_ent},
        }

    def _customers(self, n, users, rng):
        rows = [
            Customer(
                user=users["asha"],
                name="Asha Rao",
                company="Rao Traders",
                email="asha@raotraders.test",
                phone="+91 98450 12345",
                address="12 MG Road, Bengaluru",
                assigned_staff=users["staff"],
            )
        ]
        for i in range(1, n):
            first, last, comp = rng.choice(FIRST), rng.choice(LAST), rng.choice(COMPANY)
            rows.append(
                Customer(
                    name=f"{first} {last}",
                    company=f"{last} {comp}",
                    email=f"{first}.{last}.{i}@example.test".lower(),
                    phone=f"+91 9{rng.randint(100000000, 999999999)}",
                    assigned_staff=users["staff"] if i % 2 else None,
                )
            )
        return Customer.objects.bulk_create(rows, batch_size=2000)

    def _subscriptions(self, n, customers, catalog, users, today, rng):
        plans = list(catalog["plans"].values())
        weights = [30, 30, 10, 10, 20]
        products = list(catalog["products"].values())
        term_list = list(catalog["terms"].values())
        statuses = [
            (SubscriptionStatus.ACTIVE, 70),
            (SubscriptionStatus.PAUSED, 8),
            (SubscriptionStatus.CLOSED, 7),
            (SubscriptionStatus.CONFIRMED, 5),
            (SubscriptionStatus.QUOTATION, 5),
            (SubscriptionStatus.DRAFT, 5),
        ]
        status_pop, status_w = zip(*statuses, strict=True)
        product_taxes = {p.id: list(p.taxes.all()) for p in products}
        plan_taxes = {p.id: list(p.taxes.all()) for p in plans}
        variant_price = {
            catalog["products"]["Brightloop CRM"].id: (catalog["variants"]["crm_odoo"], 560),
        }

        subs, sub_lines, plans_of, periods_of = [], [], [], []
        for i in range(n):
            plan = rng.choices(plans, weights)[0]
            status = rng.choices(status_pop, status_w)[0]
            customer = customers[0] if i < 3 else rng.choice(customers)
            if i < 3:  # Asha always has a few live subscriptions for the portal demo
                status = SubscriptionStatus.ACTIVE
            billed = status in (
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.PAUSED,
                SubscriptionStatus.CLOSED,
            )
            periods = rng.randint(1, 3 if plan.billing_period == "yearly" else 8) if billed else 0
            step = STEP[plan.billing_period] * plan.interval_count
            start = (
                today - step * periods + timedelta(days=rng.randint(1, 3))
                if billed
                else (today + timedelta(days=rng.randint(0, 20)))
            )
            due_now = status == SubscriptionStatus.ACTIVE and rng.random() < 0.05 and periods > 1
            invoiced = periods - 1 if due_now else periods
            sub = Subscription(
                number="",
                customer=customer,
                plan=plan,
                status=status,
                start_date=start,
                payment_term=rng.choice(term_list),
                salesperson=users["staff"],
                next_invoice_date=(start + step * invoiced)
                if status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED)
                else None,
                expiration_date=start + step * 12 if plan.auto_close else None,
                valid_until=today + timedelta(days=15)
                if status == SubscriptionStatus.QUOTATION
                else None,
                close_reason="Moved to another vendor"
                if status == SubscriptionStatus.CLOSED
                else "",
            )
            subs.append(sub)
            plans_of.append(plan)
            periods_of.append((start, step, invoiced))
            for product in rng.sample(products, rng.randint(1, 3)):
                qty = rng.randint(max(1, plan.min_quantity), max(plan.min_quantity, 12))
                variant, extra = variant_price.get(product.id, (None, 0))
                if variant and rng.random() < 0.5:
                    variant, extra = None, 0
                sub_lines.append(
                    (
                        i,
                        SubscriptionLine(
                            product=product,
                            variant=variant,
                            quantity=qty,
                            unit_price=product.sales_price + extra,
                            description=product.name + (" (Odoo)" if variant else ""),
                        ),
                    )
                )

        self._number(subs, "subscription", lambda s: s.start_date)
        Subscription.objects.bulk_create(subs, batch_size=2000)
        for idx, line in sub_lines:
            line.subscription = subs[idx]
        SubscriptionLine.objects.bulk_create([line for _, line in sub_lines], batch_size=2000)
        Through = SubscriptionLine.taxes.through
        Through.objects.bulk_create(
            [
                Through(subscriptionline_id=line.id, tax_id=t.id)
                for _, line in sub_lines
                for t in product_taxes[line.product_id]
            ],
            batch_size=5000,
        )
        SubscriptionEvent.objects.bulk_create(
            [
                SubscriptionEvent(
                    subscription=s,
                    to_status=s.status,
                    actor=users["staff"],
                    note="Imported from spreadsheet",
                )
                for s in subs
            ],
            batch_size=2000,
        )

        # ---- historic invoices + payments
        lines_by_sub = defaultdict(list)
        for idx, line in sub_lines:
            lines_by_sub[idx].append(line)
        invoices, inv_lines, inv_taxes, payments = [], [], [], []
        methods = PaymentMethod.values
        for idx, sub in enumerate(subs):
            start, step, count = periods_of[idx]
            plan = plans_of[idx]
            for k in range(count):
                p_start = start + step * k
                p_end = start + step * (k + 1) - timedelta(days=1)
                rows = []
                if plan.price:
                    rows.append((None, plan.name, 1, plan.price, plan_taxes[plan.id]))
                for line in lines_by_sub[idx]:
                    rows.append(
                        (
                            line.product,
                            line.description,
                            line.quantity,
                            line.unit_price,
                            product_taxes[line.product_id],
                        )
                    )
                sub_total, tax_total, built = Decimal(0), Decimal(0), []
                for product, desc, qty, price, taxes in rows:
                    amount = q(qty * Decimal(price))
                    taxes_snap = [(t, q(amount * t.rate / 100)) for t in taxes]
                    tax_amount = sum((a for _, a in taxes_snap), Decimal(0))
                    built.append(
                        (
                            InvoiceLine(
                                product=product,
                                description=desc,
                                quantity=qty,
                                unit_price=price,
                                amount=amount,
                                discount_amount=0,
                                tax_amount=tax_amount,
                                total=amount + tax_amount,
                            ),
                            taxes_snap,
                        )
                    )
                    sub_total += amount
                    tax_total += tax_amount
                total = sub_total + tax_total
                due = p_start + timedelta(days=sub.payment_term.due_days)
                latest = k == count - 1
                paid = not latest and rng.random() < 0.92 or latest and rng.random() < 0.55
                inv = Invoice(
                    number="",
                    subscription=sub,
                    customer=sub.customer,
                    status=InvoiceStatus.PAID if paid else InvoiceStatus.CONFIRMED,
                    invoice_date=p_start,
                    due_date=due,
                    period_start=p_start,
                    period_end=p_end,
                    subtotal=sub_total,
                    discount_total=0,
                    tax_total=tax_total,
                    total=total,
                    amount_paid=total if paid else 0,
                )
                invoices.append((inv, built))
                if paid:
                    lag = rng.randint(0, sub.payment_term.due_days)
                    pay_date = min(today, p_start + timedelta(days=lag))
                    payments.append(
                        Payment(
                            number="",
                            invoice=inv,
                            method=rng.choice(methods),
                            amount=total,
                            payment_date=pay_date,
                            recorded_by=users["staff"],
                            reference=f"UTR{rng.randint(10**9, 10**10 - 1)}",
                        )
                    )

        invoice_objs = [inv for inv, _ in invoices]
        self._number(invoice_objs, "invoice", lambda inv: inv.invoice_date)
        Invoice.objects.bulk_create(invoice_objs, batch_size=2000)
        for inv, built in invoices:
            for line, _ in built:
                line.invoice = inv
                inv_lines.append(line)
        InvoiceLine.objects.bulk_create(inv_lines, batch_size=2000)
        for _, built in invoices:
            for line, snaps in built:
                inv_taxes.extend(
                    InvoiceLineTax(line=line, tax=t, name=t.name, rate=t.rate, amount=a)
                    for t, a in snaps
                )
        InvoiceLineTax.objects.bulk_create(inv_taxes, batch_size=5000)
        self._number(payments, "payment", lambda p: p.payment_date)
        Payment.objects.bulk_create(payments, batch_size=2000)

    def _number(self, objs, code, date_of):
        """Assign gapless numbers in date order and leave core_sequence ready for live use."""
        prefix = {"subscription": "SUB", "invoice": "INV", "payment": "PAY"}[code]
        counters = defaultdict(int)
        for obj in sorted(objs, key=date_of):
            year = date_of(obj).year
            counters[year] += 1
            obj.number = f"{prefix}/{year}/{counters[year]:05d}"
        for year, last in counters.items():
            Sequence.objects.update_or_create(
                code=code, year=year, defaults={"prefix": prefix, "next_value": last + 1}
            )
