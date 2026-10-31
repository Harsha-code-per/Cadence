"""Invoice lifecycle actions: confirm, cancel and send (docs/BILLING_RULES.md §5).

The billing engine (generation + recurring runs) lives in apps.billing.services and is
owned by the parallel billing PRs. This module only moves an existing invoice through
its lifecycle and is deliberately separate so neither PR touches the other's file.
"""

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.billing.models import Invoice, InvoiceStatus
from apps.core.audit import record
from apps.core.exceptions import DomainError

SENDABLE_STATUSES = frozenset({InvoiceStatus.CONFIRMED, InvoiceStatus.PAID})
CANCELLABLE_STATUSES = frozenset({InvoiceStatus.DRAFT, InvoiceStatus.CONFIRMED})


def _invalid(message: str, code: str = "invalid_transition") -> None:
    raise DomainError(code, message)


@transaction.atomic
def confirm_invoice(invoice_id: int, *, actor) -> Invoice:
    """draft → confirmed. A confirmed invoice is payable."""
    invoice = get_object_or_404(Invoice.objects.select_for_update(), pk=invoice_id)
    if invoice.status != InvoiceStatus.DRAFT:
        _invalid("Only draft invoices can be confirmed.")
    invoice.status = InvoiceStatus.CONFIRMED
    invoice.save(update_fields=["status", "updated_at"])
    record(actor, "invoice.confirm", invoice, {"status": InvoiceStatus.CONFIRMED})
    return invoice


@transaction.atomic
def confirm_invoices(invoice_ids, *, actor) -> int:
    """Confirm every draft in `invoice_ids`; other statuses are left untouched.

    Used by POST /api/invoices/confirm-bulk/. Returns the number confirmed so the UI
    can say "12 invoices confirmed" without a second round trip.
    """
    ids = list(dict.fromkeys(invoice_ids))
    if not ids:
        return 0
    invoices = list(
        Invoice.objects.select_for_update()
        .filter(pk__in=ids, status=InvoiceStatus.DRAFT)
        .order_by("pk")
    )
    for invoice in invoices:
        invoice.status = InvoiceStatus.CONFIRMED
        invoice.save(update_fields=["status", "updated_at"])
        record(actor, "invoice.confirm", invoice, {"status": InvoiceStatus.CONFIRMED})
    return len(invoices)


@transaction.atomic
def cancel_invoice(invoice_id: int, *, actor) -> Invoice:
    """draft/confirmed with no payments → cancelled, and release discount usage.

    Deleting the DiscountRedemption rows is what makes a usage-limited discount
    available again after a cancelled invoice (docs/BILLING_RULES.md §5).
    """
    invoice = get_object_or_404(Invoice.objects.select_for_update(), pk=invoice_id)
    if invoice.status not in CANCELLABLE_STATUSES:
        _invalid("Only draft or confirmed invoices can be cancelled.")
    if invoice.amount_paid != 0:
        _invalid(
            "An invoice with payments cannot be cancelled. Refund or reverse the payments first."
        )
    released = invoice.redemptions.count()
    invoice.redemptions.all().delete()
    invoice.status = InvoiceStatus.CANCELLED
    invoice.save(update_fields=["status", "updated_at"])
    record(
        actor,
        "invoice.cancel",
        invoice,
        {"status": InvoiceStatus.CANCELLED, "released_discount_redemptions": released},
    )
    return invoice


@transaction.atomic
def send_invoice(invoice_id: int, *, actor) -> Invoice:
    """confirmed/paid → email the customer the summary + portal link; set sent_at."""
    invoice = get_object_or_404(
        Invoice.objects.select_for_update().select_related("customer"), pk=invoice_id
    )
    if invoice.status not in SENDABLE_STATUSES:
        _invalid("Only confirmed or paid invoices can be sent. Confirm the draft first.")
    _email_customer(invoice)
    invoice.sent_at = timezone.now()
    invoice.save(update_fields=["sent_at", "updated_at"])
    record(actor, "invoice.send", invoice, {"sent_at": invoice.sent_at.isoformat()})
    return invoice


def _email_customer(invoice: Invoice) -> None:
    recipient = (invoice.customer.email or "").strip()
    if not recipient:
        raise DomainError(
            "validation_error",
            "This customer has no email address.",
            field_errors={"customer": ["Add an email address before sending the invoice."]},
        )
    portal_url = f"{settings.FRONTEND_URL}/portal/invoices/{invoice.pk}"
    subject = f"Invoice {invoice.number} from Cadence"
    body = (
        f"Hi {invoice.customer.name},\n\n"
        f"Invoice {invoice.number} ({invoice.period_start} to {invoice.period_end}) "
        f"is available.\n\n"
        f"Total: {invoice.total}\n"
        f"Outstanding: {invoice.outstanding}\n"
        f"Due date: {invoice.due_date}\n\n"
        f"View and pay it in your portal: {portal_url}\n\n"
        "Thank you,\n"
        "Cadence\n"
    )
    send_mail(subject, body, None, [recipient], fail_silently=False)
