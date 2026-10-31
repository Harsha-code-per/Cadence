from django.contrib import admin

from apps.payments.models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("number", "invoice", "method", "amount", "payment_date")
    list_filter = ("method",)
    list_select_related = ("invoice",)
