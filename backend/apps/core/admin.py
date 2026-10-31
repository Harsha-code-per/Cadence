from django.contrib import admin

from apps.core.models import AuditLog, Sequence


@admin.register(Sequence)
class SequenceAdmin(admin.ModelAdmin):
    list_display = ("code", "year", "prefix", "next_value")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "entity_type", "entity_id", "actor")
    list_filter = ("action",)
    readonly_fields = [f.name for f in AuditLog._meta.fields]
