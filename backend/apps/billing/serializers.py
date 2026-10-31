"""Serializers for the invoice API (contract: docs/API.md § Billing / invoices)."""

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import Customer
from apps.billing.changes import invoice_changes
from apps.billing.models import Invoice, InvoiceLine, InvoiceLineTax, InvoiceStatus
from apps.payments.models import Payment


class CustomerSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "name", "company"]


class SubscriptionSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    number = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)


class InvoiceLineTaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineTax
        fields = ["id", "tax", "name", "rate", "amount"]


class InvoiceLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    taxes = InvoiceLineTaxSerializer(many=True, read_only=True)

    class Meta:
        model = InvoiceLine
        fields = [
            "id",
            "product",
            "product_name",
            "description",
            "quantity",
            "unit_price",
            "amount",
            "discount_amount",
            "tax_amount",
            "total",
            "taxes",
        ]


class PaymentSummarySerializer(serializers.ModelSerializer):
    """Customer-safe payment row: recorded_by and other internal fields stay private."""

    class Meta:
        model = Payment
        fields = [
            "id",
            "number",
            "method",
            "amount",
            "payment_date",
            "reference",
            "note",
            "created_at",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    customer = CustomerSummarySerializer(read_only=True)
    subscription = SubscriptionSummarySerializer(read_only=True)
    outstanding = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "status",
            "customer",
            "subscription",
            "invoice_date",
            "due_date",
            "period_start",
            "period_end",
            "subtotal",
            "discount_total",
            "tax_total",
            "total",
            "amount_paid",
            "outstanding",
            "is_overdue",
            "sent_at",
            "created_at",
            "updated_at",
        ]

    def get_outstanding(self, obj) -> str:
        # Money is a string everywhere (docs/API.md); never let JSON render a float.
        return str(obj.outstanding.quantize(Decimal("0.01")))

    def get_is_overdue(self, obj) -> bool:
        return obj.status == InvoiceStatus.CONFIRMED and obj.due_date < timezone.localdate()


class InvoiceDetailSerializer(InvoiceSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    payments = PaymentSummarySerializer(many=True, read_only=True)
    changes = serializers.SerializerMethodField()

    class Meta(InvoiceSerializer.Meta):
        fields = [*InvoiceSerializer.Meta.fields, "lines", "payments", "changes"]

    def get_changes(self, obj) -> list[dict]:
        return invoice_changes(obj)


class InvoiceBulkConfirmSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        min_length=1,
        max_length=500,
    )


class InvoiceBulkConfirmResponseSerializer(serializers.Serializer):
    confirmed = serializers.IntegerField()
