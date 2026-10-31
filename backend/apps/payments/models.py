from django.conf import settings
from django.db import models
from django.db.models import CheckConstraint, Q

from apps.billing.models import Invoice
from apps.core.models import choices_check, money


class PaymentMethod(models.TextChoices):
    CASH = "cash", "Cash"
    BANK_TRANSFER = "bank_transfer", "Bank transfer"
    CARD = "card", "Card"
    UPI = "upi", "UPI"
    CHEQUE = "cheque", "Cheque"


class Payment(models.Model):
    number = models.CharField(max_length=30, unique=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=15, choices=PaymentMethod.choices)
    amount = money()
    payment_date = models.DateField()
    reference = models.CharField(max_length=100, blank=True)
    note = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-payment_date", "-id"]
        constraints = [
            choices_check("method", PaymentMethod, "payment_method_valid"),
            CheckConstraint(condition=Q(amount__gt=0), name="payment_amount_gt_0"),
        ]
        indexes = [models.Index(fields=["payment_date"], name="idx_payment_date")]

    def __str__(self) -> str:
        return self.number
