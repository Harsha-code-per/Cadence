from django.contrib import admin

from apps.subscriptions.models import Subscription, SubscriptionEvent, SubscriptionLine


class LineInline(admin.TabularInline):
    model = SubscriptionLine
    extra = 0


class EventInline(admin.TabularInline):
    model = SubscriptionEvent
    extra = 0
    readonly_fields = ("from_status", "to_status", "actor", "note", "created_at")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("number", "customer", "plan", "status", "next_invoice_date")
    list_filter = ("status", "plan")
    search_fields = ("number", "customer__name")
    list_select_related = ("customer", "plan")
    inlines = [LineInline, EventInline]
