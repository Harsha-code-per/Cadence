from django.contrib import admin

from apps.billing.models import BillingRun, Invoice, InvoiceLine


class LineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "number",
        "customer",
        "status",
        "invoice_date",
        "due_date",
        "total",
        "amount_paid",
    )
    list_filter = ("status",)
    search_fields = ("number", "customer__name")
    list_select_related = ("customer",)
    inlines = [LineInline]


@admin.register(BillingRun)
class BillingRunAdmin(admin.ModelAdmin):
    list_display = ("created_at", "run_date", "triggered_by", "invoiced", "skipped")
