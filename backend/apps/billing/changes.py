"""Explain a bill in plain words (docs/BILLING_RULES.md §9).

Computed on read by comparing the invoice with the previous non-cancelled invoice of
the same subscription. Nothing is stored, so historic rows never drift.
"""

from decimal import Decimal

from django.db.models import Q

from apps.billing.models import Invoice, InvoiceStatus

CENT = Decimal("0.01")


def _money(value: Decimal) -> str:
    return str(value.quantize(CENT))


def _rupees(value: Decimal) -> str:
    return f"₹{value.quantize(CENT):,.2f}"


def _line_key(line) -> tuple:
    # InvoiceLine has no variant FK; the description snapshot distinguishes variants
    # of the same product ("Brightloop CRM (Odoo)" vs "(Shopify)").
    return (line.product_id, line.description)


def _previous_invoice(invoice: Invoice) -> Invoice | None:
    return (
        Invoice.objects.filter(subscription_id=invoice.subscription_id)
        .exclude(status=InvoiceStatus.CANCELLED)
        .exclude(pk=invoice.pk)
        .filter(
            Q(invoice_date__lt=invoice.invoice_date)
            | Q(invoice_date=invoice.invoice_date, pk__lt=invoice.pk)
        )
        .prefetch_related("lines__taxes")
        .order_by("-invoice_date", "-pk")
        .first()
    )


def invoice_changes(invoice: Invoice) -> list[dict]:
    """Return [{kind, description, amount_delta}] from the previous invoice to this one."""
    previous = _previous_invoice(invoice)
    if previous is None:
        return []

    current_lines = {_line_key(line): line for line in invoice.lines.all()}
    previous_lines = {_line_key(line): line for line in previous.lines.all()}
    changes: list[dict] = []

    for key, line in current_lines.items():
        old = previous_lines.get(key)
        if old is None:
            changes.append(
                {
                    "kind": "line_added",
                    "description": f"New line: {line.description}",
                    "amount_delta": _money(line.total),
                }
            )
            continue

        if line.quantity != old.quantity:
            changes.append(
                {
                    "kind": "quantity_changed",
                    "description": (
                        f"{line.description}: quantity {old.quantity} → {line.quantity}"
                    ),
                    "amount_delta": _money(line.total - old.total),
                }
            )

        if line.unit_price != old.unit_price:
            changes.append(
                {
                    "kind": "unit_price_changed",
                    "description": (
                        f"{line.description}: unit price {_rupees(old.unit_price)} → "
                        f"{_rupees(line.unit_price)}"
                    ),
                    "amount_delta": _money(line.total - old.total),
                }
            )

        old_taxes = {tax.name: tax.rate for tax in old.taxes.all()}
        new_taxes = {tax.name: tax.rate for tax in line.taxes.all()}
        for name in sorted(set(old_taxes) | set(new_taxes)):
            old_rate = old_taxes.get(name)
            new_rate = new_taxes.get(name)
            if old_rate == new_rate:
                continue
            if old_rate is None:
                description = f"Tax {name} added to {line.description} ({new_rate}%)"
            elif new_rate is None:
                description = f"Tax {name} removed from {line.description} (was {old_rate}%)"
            else:
                description = (
                    f"Tax {name} on {line.description} changed from {old_rate}% to {new_rate}%"
                )
            changes.append(
                {
                    "kind": "tax_changed",
                    "description": description,
                    "amount_delta": _money(line.tax_amount - old.tax_amount),
                }
            )

    for key, old in previous_lines.items():
        if key not in current_lines:
            changes.append(
                {
                    "kind": "line_removed",
                    "description": f"Line removed: {old.description}",
                    "amount_delta": _money(-old.total),
                }
            )

    if invoice.discount_total != previous.discount_total:
        if previous.discount_total == 0:
            description = f"A discount of {_rupees(invoice.discount_total)} was applied."
        elif invoice.discount_total == 0:
            description = f"The discount of {_rupees(previous.discount_total)} no longer applies."
        else:
            description = (
                f"The discount changed from {_rupees(previous.discount_total)} to "
                f"{_rupees(invoice.discount_total)}."
            )
        changes.append(
            {
                "kind": "discount_changed",
                "description": description,
                "amount_delta": _money(invoice.discount_total - previous.discount_total),
            }
        )

    return changes
