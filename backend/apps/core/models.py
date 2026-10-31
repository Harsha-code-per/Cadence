from django.conf import settings
from django.db import models
from django.db.models import CheckConstraint, Q


def money(**kwargs) -> models.DecimalField:
    """NUMERIC(12,2). All money in Cadence goes through this; never floats."""
    kwargs.setdefault("default", 0)
    return models.DecimalField(max_digits=12, decimal_places=2, **kwargs)


def choices_check(field: str, choices: type[models.TextChoices], name: str) -> CheckConstraint:
    """DB-level CHECK (field IN (...)) generated from a TextChoices enum."""
    return CheckConstraint(condition=Q(**{f"{field}__in": choices.values}), name=name)


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Sequence(models.Model):
    """Gapless per-year document numbering (SUB/2026/00001). See apps.core.sequences."""

    code = models.CharField(max_length=30)
    year = models.PositiveSmallIntegerField()
    prefix = models.CharField(max_length=10)
    next_value = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["code", "year"], name="uq_sequence_code_year"),
            CheckConstraint(condition=Q(next_value__gt=0), name="sequence_next_value_positive"),
        ]

    def __str__(self) -> str:
        return f"{self.prefix}/{self.year} → {self.next_value}"


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    action = models.CharField(max_length=60)
    entity_type = models.CharField(max_length=60)
    entity_id = models.BigIntegerField()
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["entity_type", "entity_id", "-created_at"], name="idx_audit_entity"
            )
        ]

    def __str__(self) -> str:
        return f"{self.action} {self.entity_type}#{self.entity_id}"
