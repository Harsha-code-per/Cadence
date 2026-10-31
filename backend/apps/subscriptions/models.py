from django.conf import settings
from django.db import models
from django.db.models import CheckConstraint, F, Q

from apps.accounts.models import Customer
from apps.catalog.models import Discount, PaymentTerm, Plan, Product, ProductVariant, Tax
from apps.core.models import TimeStampedModel, choices_check, money


class SubscriptionStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    QUOTATION = "quotation", "Quotation"
    CONFIRMED = "confirmed", "Confirmed"
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    CLOSED = "closed", "Closed"


class Subscription(TimeStampedModel):
    number = models.CharField(max_length=30, unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="subscriptions")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(
        max_length=10, choices=SubscriptionStatus.choices, default=SubscriptionStatus.DRAFT
    )
    start_date = models.DateField()
    expiration_date = models.DateField(null=True, blank=True)
    next_invoice_date = models.DateField(null=True, blank=True)
    payment_term = models.ForeignKey(PaymentTerm, on_delete=models.PROTECT, related_name="+")
    quotation_template = models.ForeignKey(
        "catalog.QuotationTemplate",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="subscriptions",
    )
    valid_until = models.DateField(null=True, blank=True, help_text="Quotation expiry")
    discount = models.ForeignKey(
        Discount, null=True, blank=True, on_delete=models.PROTECT, related_name="subscriptions"
    )
    salesperson = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    renewed_from = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="renewals"
    )
    close_reason = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            choices_check("status", SubscriptionStatus, "subscription_status_valid"),
            CheckConstraint(
                condition=Q(expiration_date__isnull=True) | Q(expiration_date__gte=F("start_date")),
                name="subscription_dates_ordered",
            ),
        ]
        indexes = [
            # The billing engine's only scan: "active and due".
            models.Index(
                fields=["next_invoice_date"],
                condition=Q(status="active"),
                name="idx_sub_due",
            ),
            models.Index(fields=["status"], name="idx_sub_status"),
            models.Index(fields=["customer", "-created_at"], name="idx_sub_customer_created"),
        ]

    def __str__(self) -> str:
        return self.number

    @property
    def effective_end(self):
        return self.expiration_date or (self.plan.end_date if self.plan.auto_close else None)


class SubscriptionLine(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="+")
    variant = models.ForeignKey(
        ProductVariant, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    description = models.CharField(max_length=255, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = money(help_text="Snapshot at creation; catalog edits don't change contracts")
    taxes = models.ManyToManyField(Tax, blank=True, related_name="+")

    class Meta:
        ordering = ["id"]
        constraints = [
            CheckConstraint(condition=Q(quantity__gte=1), name="sub_line_qty_gte_1"),
            CheckConstraint(condition=Q(unit_price__gte=0), name="sub_line_price_gte_0"),
        ]

    @property
    def amount(self):
        return self.quantity * self.unit_price


class SubscriptionEvent(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="events")
    from_status = models.CharField(max_length=10, blank=True)
    to_status = models.CharField(max_length=10)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["subscription", "created_at"], name="idx_sub_event")]
