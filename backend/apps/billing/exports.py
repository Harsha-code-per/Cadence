"""CSV export of invoices."""

import csv

HEADER = [
    "Invoice",
    "Customer",
    "Company",
    "Status",
    "Invoice date",
    "Due date",
    "Subtotal",
    "Discount",
    "Tax",
    "Total",
    "Paid",
    "Outstanding",
]


class _Echo:
    def write(self, value):
        return value


def safe_cell(value) -> str:
    """Stop a customer name like =HYPERLINK(...) running as a formula in Excel."""
    text = str(value or "")
    return f"'{text}" if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def invoice_csv(invoices):
    writer = csv.writer(_Echo())
    yield writer.writerow(HEADER)
    for invoice in invoices:
        yield writer.writerow(
            [
                invoice.number,
                safe_cell(invoice.customer.name),
                safe_cell(invoice.customer.company),
                invoice.status,
                invoice.invoice_date,
                invoice.due_date,
                invoice.subtotal,
                invoice.discount_total,
                invoice.tax_total,
                invoice.total,
                invoice.amount_paid,
                invoice.total - invoice.amount_paid,
            ]
        )
