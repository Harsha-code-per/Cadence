"""Serializers for the subscription API (contract: docs/API.md § Subscriptions)."""

from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import Customer
from apps.catalog.models import (
    Discount,
    PaymentTerm,
    Plan,
    Product,
    ProductVariant,
    QuotationTemplate,
    Tax,
)
from apps.subscriptions.models import Subscription, SubscriptionEvent, SubscriptionLine

READ_ONLY_FIELDS = (
    "id",
    "number",
    "status",
    "next_invoice_date",
    "valid_until",
    "close_reason",
    "renewed_from",
    "quotation_template",
    "salesperson",
    "created_at",
    "updated_at",
    "recurring_total",
    "allowed_actions",
)


class AddonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    sales_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    on = serializers.BooleanField()


class AddonWriteSerializer(serializers.Serializer):
    product = serializers.IntegerField(min_value=1)


def _reject_read_only(initial_data, serializer, extra=()):
    errors = {
        field: ["This field is read-only; use a lifecycle action instead."]
        for field in (*READ_ONLY_FIELDS, *extra)
        if field in initial_data
    }
    if errors:
        raise serializers.ValidationError(errors)
    return serializer


class CustomerSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "name", "company"]


class PlanSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            "id",
            "name",
            "billing_period",
            "interval_count",
            "price",
            "min_quantity",
            "auto_close",
            "closable",
            "pausable",
            "renewable",
        ]


class PaymentTermSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTerm
        fields = ["id", "name", "due_days"]


class DiscountSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Discount
        fields = ["id", "name", "code", "discount_type", "value", "scope"]


class UserSummarySerializer(serializers.Serializer):
    """Internal users referenced by a subscription; no email exposed to customers."""

    id = serializers.IntegerField(read_only=True)
    full_name = serializers.CharField(read_only=True)


class SubscriptionLineSerializer(serializers.ModelSerializer):
    """Read representation; write shapes live in SubscriptionLineWriteSerializer."""

    amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    tax_ids = serializers.SerializerMethodField()
    product_name = serializers.CharField(source="product.name", read_only=True)
    variant_label = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionLine
        fields = [
            "id",
            "product",
            "product_name",
            "variant",
            "variant_label",
            "description",
            "quantity",
            "unit_price",
            "tax_ids",
            "amount",
        ]

    def get_tax_ids(self, obj) -> list[int]:
        return [tax.id for tax in obj.taxes.all()]

    def get_variant_label(self, obj) -> str | None:
        return obj.variant.label if obj.variant else None


class SubscriptionLineWriteSerializer(serializers.Serializer):
    """One line in a create payload or a line PATCH (docs/API.md)."""

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    variant = serializers.PrimaryKeyRelatedField(
        queryset=ProductVariant.objects.all(), required=False, allow_null=True
    )
    description = serializers.CharField(required=False, allow_blank=True, max_length=255)
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False
    )
    # Absent = copy the product's default taxes; [] = explicitly no tax.
    tax_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tax.objects.all(), many=True, required=False
    )

    def validate(self, attrs):
        product = attrs.get("product") or getattr(self.instance, "product", None)
        variant = attrs.get("variant")
        if "variant" not in attrs and self.instance is not None:
            variant = self.instance.variant
        if variant is not None and (product is None or variant.product_id != product.pk):
            raise serializers.ValidationError(
                {"variant": ["This variant does not belong to the selected product."]}
            )
        if self.instance is None:
            if attrs.get("unit_price") is None:
                attrs["unit_price"] = variant.price if variant else product.sales_price
            if not attrs.get("description"):
                attrs["description"] = (
                    f"{product.name} ({variant.label})" if variant else product.name
                )
        return attrs


class SubscriptionActionSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class SubscriptionCreateSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.all())
    start_date = serializers.DateField()
    expiration_date = serializers.DateField(required=False, allow_null=True)
    payment_term = serializers.PrimaryKeyRelatedField(queryset=PaymentTerm.objects.all())
    discount = serializers.PrimaryKeyRelatedField(
        queryset=Discount.objects.all(), required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    lines = SubscriptionLineWriteSerializer(many=True, required=False)

    def validate(self, attrs):
        _reject_read_only(self.initial_data, self)
        start = attrs["start_date"]
        end = attrs.get("expiration_date")
        if end is not None and end < start:
            raise serializers.ValidationError(
                {"expiration_date": ["The expiration date cannot be before the start date."]}
            )
        attrs.setdefault("lines", [])
        return attrs


class SubscriptionUpdateSerializer(serializers.Serializer):
    """PATCH in draft only; status and every derived field are rejected, never written."""

    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False)
    plan = serializers.PrimaryKeyRelatedField(queryset=Plan.objects.all(), required=False)
    start_date = serializers.DateField(required=False)
    expiration_date = serializers.DateField(required=False, allow_null=True)
    payment_term = serializers.PrimaryKeyRelatedField(
        queryset=PaymentTerm.objects.all(), required=False
    )
    discount = serializers.PrimaryKeyRelatedField(
        queryset=Discount.objects.all(), required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        _reject_read_only(self.initial_data, self, extra=("lines",))
        start = attrs.get("start_date", self.instance.start_date)
        end = attrs.get("expiration_date", self.instance.expiration_date)
        if end is not None and end < start:
            raise serializers.ValidationError(
                {"expiration_date": ["The expiration date cannot be before the start date."]}
            )
        return attrs


class SubscriptionFromTemplateSerializer(serializers.Serializer):
    template = serializers.PrimaryKeyRelatedField(queryset=QuotationTemplate.objects.all())
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    start_date = serializers.DateField()


class SubscriptionEventSerializer(serializers.ModelSerializer):
    actor = UserSummarySerializer(read_only=True)

    class Meta:
        model = SubscriptionEvent
        fields = ["id", "from_status", "to_status", "actor", "note", "created_at"]


class SubscriptionSerializer(serializers.ModelSerializer):
    customer = CustomerSummarySerializer(read_only=True)
    plan = PlanSummarySerializer(read_only=True)
    payment_term = PaymentTermSummarySerializer(read_only=True)
    discount = DiscountSummarySerializer(read_only=True)
    salesperson = UserSummarySerializer(read_only=True)
    lines = SubscriptionLineSerializer(many=True, read_only=True)
    recurring_total = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            "id",
            "number",
            "status",
            "customer",
            "plan",
            "start_date",
            "expiration_date",
            "next_invoice_date",
            "valid_until",
            "payment_term",
            "discount",
            "quotation_template",
            "salesperson",
            "renewed_from",
            "close_reason",
            "notes",
            "lines",
            "recurring_total",
            "allowed_actions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "number",
            "status",
            "next_invoice_date",
            "valid_until",
            "close_reason",
            "renewed_from",
            "quotation_template",
            "created_at",
            "updated_at",
        ]

    def get_recurring_total(self, obj) -> str:
        total = obj.plan.price + sum((line.amount for line in obj.lines.all()), Decimal("0"))
        # Money is a string everywhere (docs/API.md); never let JSON render a float.
        return str(total.quantize(Decimal("0.01")))

    def get_allowed_actions(self, obj) -> list[str]:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return []
        from apps.subscriptions.services import available_actions

        return available_actions(obj, request.user)
