from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from rest_framework import serializers

from .models import (
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


class VariantSummarySerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    label = serializers.CharField(read_only=True)

    class Meta:
        model = ProductVariant
        fields = ("id", "label", "price", "sku")


class ProductSerializer(serializers.ModelSerializer):
    tax_ids = serializers.PrimaryKeyRelatedField(
        source="taxes", many=True, queryset=Tax.objects.all(), required=False
    )
    variants = VariantSummarySerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "product_type",
            "sales_price",
            "cost_price",
            "notes",
            "is_active",
            "tax_ids",
            "variants",
        )
        extra_kwargs = {"sales_price": {"min_value": 0}, "cost_price": {"min_value": 0}}


class VariantSerializer(VariantSummarySerializer):
    value_ids = serializers.PrimaryKeyRelatedField(
        source="values", many=True, queryset=AttributeValue.objects.all()
    )

    class Meta:
        model = ProductVariant
        fields = ("id", "product", "value_ids", "sku", "price", "label")


class AttributeValueSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False, min_value=1)

    class Meta:
        model = AttributeValue
        fields = ("id", "name", "extra_price")
        extra_kwargs = {"extra_price": {"min_value": 0}}
        validators = []


class AttributeSerializer(serializers.ModelSerializer):
    values = AttributeValueSerializer(many=True)

    class Meta:
        model = Attribute
        fields = ("id", "name", "values")

    def validate_values(self, values: list) -> list:
        existing = (
            {value.pk: value for value in self.instance.values.all()} if self.instance else {}
        )
        for value in values:
            if "name" not in value:
                child = existing.get(value.get("id"))
                if child is None:
                    raise serializers.ValidationError("New values require a name.")
                value["name"] = child.name
        names = [value["name"] for value in values]
        ids = [value["id"] for value in values if "id" in value]
        if len(names) != len(set(names)) or len(ids) != len(set(ids)):
            raise serializers.ValidationError("Value names and IDs must be unique.")
        owned = set(existing)
        if not set(ids) <= owned:
            raise serializers.ValidationError("Value IDs must belong to this attribute.")
        return values

    @transaction.atomic
    def create(self, validated_data: dict) -> Attribute:
        values = validated_data.pop("values")
        attribute = super().create(validated_data)
        for value in values:
            AttributeValue.objects.create(attribute=attribute, **value)
        return attribute

    @transaction.atomic
    def update(self, instance: Attribute, validated_data: dict) -> Attribute:
        values = validated_data.pop("values", None)
        instance = super().update(instance, validated_data)
        if values is not None:
            # An explicit collection replaces it; omitted values on PATCH stay unchanged.
            ids = [value["id"] for value in values if "id" in value]
            instance.values.exclude(id__in=ids).delete()
            # Temporarily clear names so existing values may exchange names safely.
            for value_id in ids:
                instance.values.filter(id=value_id).update(name=uuid4().hex)
            for value in values:
                value_id = value.pop("id", None)
                if value_id is None:
                    AttributeValue.objects.create(attribute=instance, **value)
                else:
                    child = instance.values.get(id=value_id)
                    for field, item in value.items():
                        setattr(child, field, item)
                    child.save()
        return instance


class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ("id", "name", "rate", "is_active")
        extra_kwargs = {"rate": {"min_value": 0, "max_value": 100}}


class PaymentTermSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTerm
        fields = ("id", "name", "due_days")


class DateWindowSerializer(serializers.ModelSerializer):
    def validate(self, attrs: dict) -> dict:
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "Must be on or after start_date."})
        return attrs


class PlanSerializer(DateWindowSerializer):
    tax_ids = serializers.PrimaryKeyRelatedField(
        source="taxes", many=True, queryset=Tax.objects.all(), required=False
    )

    class Meta:
        model = Plan
        fields = (
            "id",
            "name",
            "price",
            "billing_period",
            "interval_count",
            "min_quantity",
            "start_date",
            "end_date",
            "auto_close",
            "closable",
            "pausable",
            "renewable",
            "is_active",
            "tax_ids",
        )
        extra_kwargs = {
            "price": {"min_value": 0},
            "interval_count": {"min_value": 1},
            "min_quantity": {"min_value": 1},
        }


class DiscountSerializer(DateWindowSerializer):
    product_ids = serializers.PrimaryKeyRelatedField(
        source="products", many=True, queryset=Product.objects.all(), required=False
    )
    times_used = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Discount
        fields = (
            "id",
            "name",
            "code",
            "discount_type",
            "value",
            "scope",
            "product_ids",
            "min_amount",
            "min_quantity",
            "start_date",
            "end_date",
            "usage_limit",
            "times_used",
            "is_active",
        )
        extra_kwargs = {
            "value": {"min_value": Decimal("0.01")},
            "min_amount": {"min_value": 0},
            "usage_limit": {"min_value": 1},
        }

    def validate(self, attrs: dict) -> dict:
        attrs = super().validate(attrs)
        kind = attrs.get("discount_type", getattr(self.instance, "discount_type", None))
        value = attrs.get("value", getattr(self.instance, "value", None))
        if kind == "percent" and value is not None and value > 100:
            raise serializers.ValidationError({"value": "Percentage cannot exceed 100."})
        return attrs


class TemplateLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuotationTemplateLine
        fields = ("product", "variant", "quantity", "description")
        extra_kwargs = {"quantity": {"min_value": 1}}

    def validate(self, attrs: dict) -> dict:
        if "product" not in attrs:
            raise serializers.ValidationError({"product": "This field is required."})
        variant = attrs.get("variant")
        if variant and variant.product_id != attrs["product"].pk:
            raise serializers.ValidationError({"variant": "Variant must belong to the product."})
        return attrs


class QuotationTemplateSerializer(serializers.ModelSerializer):
    lines = TemplateLineSerializer(many=True)

    class Meta:
        model = QuotationTemplate
        fields = ("id", "name", "validity_days", "plan", "payment_term", "notes", "lines")
        extra_kwargs = {"validity_days": {"min_value": 1}}

    @transaction.atomic
    def create(self, validated_data: dict) -> QuotationTemplate:
        lines = validated_data.pop("lines")
        instance = super().create(validated_data)
        for line in lines:
            QuotationTemplateLine.objects.create(template=instance, **line)
        return instance

    @transaction.atomic
    def update(self, instance: QuotationTemplate, validated_data: dict) -> QuotationTemplate:
        lines = validated_data.pop("lines", None)
        instance = super().update(instance, validated_data)
        if lines is not None:
            instance.lines.all().delete()
            for line in lines:
                QuotationTemplateLine.objects.create(template=instance, **line)
        return instance
