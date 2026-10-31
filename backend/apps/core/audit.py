from apps.core.models import AuditLog


def record(actor, action: str, obj, changes: dict | None = None) -> AuditLog:
    """Append an audit entry. Call from services (never views). actor=None means system."""
    return AuditLog.objects.create(
        actor=actor if actor is not None and actor.is_authenticated else None,
        action=action,
        entity_type=obj._meta.label_lower,
        entity_id=obj.pk,
        changes=changes or {},
    )
