from datetime import date
from decimal import Decimal

from rest_framework import serializers

from apps.billing.models import Invoice
from apps.payments.models import Payment, PaymentMethod
from apps.payments.services import record_payment


class PaymentSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    customer_id = serializers.IntegerField(source="invoice.customer_id", read_only=True)
    customer_name = serializers.CharField(source="invoice.customer.name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "number",
            "invoice",
            "invoice_number",
            "customer_id",
            "customer_name",
            "method",
            "amount",
            "payment_date",
            "reference",
            "note",
            "recorded_by",
            "recorded_by_name",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "number",
            "invoice_number",
            "customer_id",
            "customer_name",
            "recorded_by",
            "recorded_by_name",
            "created_at",
        ]


class PaymentCreateSerializer(serializers.Serializer):
    invoice = serializers.PrimaryKeyRelatedField(queryset=Invoice.objects.all())
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    payment_date = serializers.DateField(default=date.today)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def create(self, validated_data):
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        return record_payment(
            invoice_id=validated_data["invoice"].id,
            amount=validated_data["amount"],
            method=validated_data["method"],
            payment_date=validated_data["payment_date"],
            reference=validated_data.get("reference", ""),
            note=validated_data.get("note", ""),
            actor=actor,
        )
