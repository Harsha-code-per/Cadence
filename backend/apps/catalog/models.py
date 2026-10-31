from decimal import Decimal

from django.db import models
from django.db.models import CheckConstraint, F, Q
from django.db.models.functions import Lower

from apps.core.models import TimeStampedModel, choices_check, money


class Tax(TimeStampedModel):
    name = models.CharField(max_length=60, unique=True)
    rate = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percent, e.g. 18.00")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "taxes"
        constraints = [
            CheckConstraint(condition=Q(rate__gte=0) & Q(rate__lte=100), name="tax_rate_0_100")
        ]

    def __str__(self) -> str:
        return self.name


class PaymentTerm(TimeStampedModel):
    name = models.CharField(max_length=60, unique=True)
    due_days = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["due_days"]

    def __str__(self) -> str:
        return self.name


class ProductType(models.TextChoices):
    SERVICE = "service", "Service"
    GOODS = "goods", "Goods"
    ADDON = "addon", "Add-on"


class Product(TimeStampedModel):
    name = models.CharField(max_length=150)
    product_type = models.CharField(
        max_length=10, choices=ProductType.choices, default=ProductType.SERVICE
    )
    sales_price = money()
    cost_price = money()
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    taxes = models.ManyToManyField(Tax, blank=True, related_name="products")

    class Meta:
        ordering = ["name"]
        constraints = [
            choices_check("product_type", ProductType, "product_type_valid"),
            CheckConstraint(condition=Q(sales_price__gte=0), name="product_sales_price_gte_0"),
            CheckConstraint(condition=Q(cost_price__gte=0), name="product_cost_price_gte_0"),
        ]
        indexes = [models.Index(Lower("name"), name="idx_product_name_ci")]

    def __str__(self) -> str:
        return self.name


class Attribute(TimeStampedModel):
    name = models.CharField(max_length=60, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class AttributeValue(TimeStampedModel):
    attribute = models.ForeignKey(Attribute, on_delete=models.CASCADE, related_name="values")
    name = models.CharField(max_length=60)
    extra_price = money()

    class Meta:
        ordering = ["attribute__name", "name"]
        constraints = [
            models.UniqueConstraint(fields=["attribute", "name"], name="uq_attribute_value"),
            CheckConstraint(condition=Q(extra_price__gte=0), name="attr_value_extra_gte_0"),
        ]

    def __str__(self) -> str:
        return f"{self.attribute.name}: {self.name}"


class ProductVariant(TimeStampedModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    values = models.ManyToManyField(AttributeValue, related_name="variants")
    sku = models.CharField(max_length=60, unique=True, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["product__name", "id"]

    def __str__(self) -> str:
        return f"{self.product.name} ({self.label})"

    @property
    def label(self) -> str:
        return ", ".join(str(v) for v in self.values.all()) or "Default"

    @property
    def price(self) -> Decimal:
        """Variant price = product price + Σ attribute extras (Brand Odoo → +560)."""
        return self.product.sales_price + sum(
            (v.extra_price for v in self.values.all()), Decimal("0")
        )


class BillingPeriod(models.TextChoices):
    DAILY = "daily", "Daily"
    WEEKLY = "weekly", "Weekly"
    MONTHLY = "monthly", "Monthly"
    YEARLY = "yearly", "Yearly"


class Plan(TimeStampedModel):
    name = models.CharField(max_length=150)
    price = money(help_text="Recurring plan fee per period; 0 = products only")
    billing_period = models.CharField(
        max_length=10, choices=BillingPeriod.choices, default=BillingPeriod.MONTHLY
    )
    interval_count = models.PositiveSmallIntegerField(default=1)
    min_quantity = models.PositiveIntegerField(default=1)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    auto_close = models.BooleanField(default=False)
    closable = models.BooleanField(default=True)
    pausable = models.BooleanField(default=False)
    renewable = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    taxes = models.ManyToManyField(Tax, blank=True, related_name="plans")

    class Meta:
        ordering = ["name"]
        constraints = [
            choices_check("billing_period", BillingPeriod, "plan_billing_period_valid"),
            CheckConstraint(condition=Q(price__gte=0), name="plan_price_gte_0"),
            CheckConstraint(condition=Q(interval_count__gte=1), name="plan_interval_gte_1"),
            CheckConstraint(condition=Q(min_quantity__gte=1), name="plan_min_qty_gte_1"),
            CheckConstraint(
                condition=Q(end_date__isnull=True) | Q(end_date__gte=F("start_date")),
                name="plan_dates_ordered",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class DiscountType(models.TextChoices):
    PERCENT = "percent", "Percentage"
    FIXED = "fixed", "Fixed amount"


class DiscountScope(models.TextChoices):
    SUBSCRIPTION = "subscription", "Whole subscription"
    PRODUCT = "product", "Specific products"


class Discount(TimeStampedModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=40, unique=True, null=True, blank=True)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices)
    value = money()
    scope = models.CharField(
        max_length=15, choices=DiscountScope.choices, default=DiscountScope.SUBSCRIPTION
    )
    products = models.ManyToManyField(Product, blank=True, related_name="discounts")
    min_amount = money()
    min_quantity = models.PositiveIntegerField(default=0)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Empty = unlimited")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-start_date", "name"]
        constraints = [
            choices_check("discount_type", DiscountType, "discount_type_valid"),
            choices_check("scope", DiscountScope, "discount_scope_valid"),
            CheckConstraint(condition=Q(value__gt=0), name="discount_value_gt_0"),
            CheckConstraint(
                condition=~Q(discount_type="percent") | Q(value__lte=100),
                name="discount_percent_lte_100",
            ),
            CheckConstraint(condition=Q(min_amount__gte=0), name="discount_min_amount_gte_0"),
            CheckConstraint(
                condition=Q(end_date__isnull=True) | Q(end_date__gte=F("start_date")),
                name="discount_dates_ordered",
            ),
            CheckConstraint(
                condition=Q(usage_limit__isnull=True) | Q(usage_limit__gt=0),
                name="discount_usage_limit_positive",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class QuotationTemplate(TimeStampedModel):
    name = models.CharField(max_length=150)
    validity_days = models.PositiveSmallIntegerField(default=15)
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="quotation_templates")
    payment_term = models.ForeignKey(
        PaymentTerm, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            CheckConstraint(condition=Q(validity_days__gte=1), name="template_validity_gte_1")
        ]

    def __str__(self) -> str:
        return self.name


class QuotationTemplateLine(models.Model):
    template = models.ForeignKey(QuotationTemplate, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="+")
    variant = models.ForeignKey(
        ProductVariant, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    quantity = models.PositiveIntegerField(default=1)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [
            CheckConstraint(condition=Q(quantity__gte=1), name="template_line_qty_gte_1")
        ]
