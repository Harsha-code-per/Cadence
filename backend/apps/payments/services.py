from datetime import date
from decimal import Decimal

from django.db import transaction

from apps.billing.models import Invoice, InvoiceStatus
from apps.core import audit
from apps.core.exceptions import DomainError
from apps.core.sequences import next_number
from apps.payments.models import Payment, PaymentMethod


def record_payment(
    *,
    invoice_id: int,
    amount: Decimal,
    method: str,
    payment_date: date,
    reference: str = "",
    note: str = "",
    actor=None,
) -> Payment:
    """Record a payment against a confirmed invoice under row lock.

    Guarantees:
    - Atomicity & row lock on Invoice
    - Only confirmed invoices can receive payment
    - Amount must be positive and <= outstanding balance
    - If fully paid, sets status to 'paid'
    - Gapless sequence numbering (PAY/YYYY/00001)
    - Audit log entry recorded
    """
    if amount <= Decimal("0.00"):
        raise DomainError(
            "invalid_amount",
            "Payment amount must be greater than zero.",
            field_errors={"amount": ["Amount must be greater than zero."]},
        )

    if method not in PaymentMethod.values:
        raise DomainError(
            "invalid_method",
            f"Invalid payment method '{method}'.",
            field_errors={"method": [f"Choose one of {', '.join(PaymentMethod.values)}."]},
        )

    with transaction.atomic():
        try:
            invoice = Invoice.objects.select_for_update().get(pk=invoice_id)
        except Invoice.DoesNotExist:
            raise DomainError("not_found", "Invoice not found.", http_status=404) from None

        if invoice.status != InvoiceStatus.CONFIRMED:
            raise DomainError(
                "invoice_not_payable",
                f"Cannot record payment for invoice with status '{invoice.status}'. Only confirmed invoices can receive payments.",
                field_errors={"invoice": ["Invoice is not payable."]},
            )

        outstanding = invoice.total - invoice.amount_paid
        if amount > outstanding:
            raise DomainError(
                "overpayment",
                f"Payment amount of {amount} exceeds outstanding balance of {outstanding}.",
                field_errors={"amount": [f"Amount exceeds outstanding balance of {outstanding}."]},
            )

        pay_number = next_number("payment", on=payment_date)
        payment = Payment.objects.create(
            number=pay_number,
            invoice=invoice,
            method=method,
            amount=amount,
            payment_date=payment_date,
            reference=reference,
            note=note,
            recorded_by=actor if actor and actor.is_authenticated else None,
        )

        invoice.amount_paid += amount
        if invoice.amount_paid == invoice.total:
            invoice.status = InvoiceStatus.PAID
        invoice.save(update_fields=["amount_paid", "status", "updated_at"])

        audit.record(
            actor,
            "payment.create",
            payment,
            {
                "number": payment.number,
                "amount": str(payment.amount),
                "invoice": invoice.number,
                "status": invoice.status,
            },
        )

    return payment
