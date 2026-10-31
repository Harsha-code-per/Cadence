from django.db import models
from django.db.models import CheckConstraint, F, Q

from apps.accounts.models import Customer
from apps.catalog.models import Discount, Product, Tax
from apps.core.models import TimeStampedModel, choices_check, money
from apps.subscriptions.models import Subscription


class InvoiceStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    CONFIRMED = "confirmed", "Confirmed"
    PAID = "paid", "Paid"
    CANCELLED = "cancelled", "Cancelled"


class Invoice(TimeStampedModel):
    number = models.CharField(max_length=30, unique=True)
    subscription = models.ForeignKey(
        Subscription, on_delete=models.PROTECT, related_name="invoices"
    )
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="invoices")
    status = models.CharField(
        max_length=10, choices=InvoiceStatus.choices, default=InvoiceStatus.DRAFT
    )
    invoice_date = models.DateField()
    due_date = models.DateField()
    period_start = models.DateField()
    period_end = models.DateField()
    subtotal = money()
    discount_total = money()
    tax_total = money()
    total = money()
    amount_paid = money()
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-invoice_date", "-id"]
        constraints = [
            choices_check("status", InvoiceStatus, "invoice_status_valid"),
            # A billing period can never be invoiced twice (idempotent billing).
            models.UniqueConstraint(
                fields=["subscription", "period_start"],
                condition=~Q(status="cancelled"),
                name="uq_invoice_period",
            ),
            CheckConstraint(
                condition=Q(due_date__gte=F("invoice_date")), name="inv_due_after_date"
            ),
            CheckConstraint(
                condition=Q(period_end__gte=F("period_start")), name="inv_period_ordered"
            ),
            CheckConstraint(condition=Q(subtotal__gte=0), name="inv_subtotal_gte_0"),
            CheckConstraint(condition=Q(discount_total__gte=0), name="inv_discount_gte_0"),
            CheckConstraint(condition=Q(tax_total__gte=0), name="inv_tax_gte_0"),
            CheckConstraint(condition=Q(total__gte=0), name="inv_total_gte_0"),
            CheckConstraint(
                condition=Q(total=F("subtotal") - F("discount_total") + F("tax_total")),
                name="inv_total_consistent",
            ),
            CheckConstraint(
                condition=Q(amount_paid__gte=0) & Q(amount_paid__lte=F("total")),
                name="inv_amount_paid_within_total",
            ),
            CheckConstraint(
                condition=~Q(status="paid") | Q(amount_paid=F("total")),
                name="inv_paid_means_fully_paid",
            ),
        ]
        indexes = [
            # Outstanding / overdue lookups.
            models.Index(
                fields=["due_date"], condition=Q(status="confirmed"), name="idx_inv_open_due"
            ),
            models.Index(fields=["customer", "-invoice_date"], name="idx_inv_customer_date"),
            models.Index(fields=["status", "invoice_date"], name="idx_inv_status_date"),
        ]

    def __str__(self) -> str:
        return self.number

    @property
    def outstanding(self):
        return self.total - self.amount_paid


class InvoiceLine(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(
        Product, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = money()
    amount = money()
    discount_amount = money()
    tax_amount = money()
    total = money()

    class Meta:
        ordering = ["id"]
        constraints = [
            CheckConstraint(condition=Q(quantity__gte=1), name="inv_line_qty_gte_1"),
            CheckConstraint(
                condition=Q(discount_amount__gte=0) & Q(discount_amount__lte=F("amount")),
                name="inv_line_discount_within_amount",
            ),
            CheckConstraint(
                condition=Q(total=F("amount") - F("discount_amount") + F("tax_amount")),
                name="inv_line_total_consistent",
            ),
        ]


class InvoiceLineTax(models.Model):
    """Snapshot so historic invoices never change when a tax rate is edited."""

    line = models.ForeignKey(InvoiceLine, on_delete=models.CASCADE, related_name="taxes")
    tax = models.ForeignKey(Tax, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    name = models.CharField(max_length=60)
    rate = models.DecimalField(max_digits=5, decimal_places=2)
    amount = money()


class DiscountRedemption(models.Model):
    """One row per invoice a discount was applied to. Usage = COUNT(rows); never drifts."""

    discount = models.ForeignKey(Discount, on_delete=models.PROTECT, related_name="redemptions")
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="redemptions")
    amount = money()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["discount", "invoice"], name="uq_discount_invoice")
        ]


class BillingRun(models.Model):
    """One row per billing batch, for the 'last run' indicator and debugging."""

    run_date = models.DateField()
    triggered_by = models.CharField(max_length=20)  # manual | scheduler | command
    activated = models.PositiveIntegerField(default=0)
    closed = models.PositiveIntegerField(default=0)
    invoiced = models.PositiveIntegerField(default=0)
    skipped = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
