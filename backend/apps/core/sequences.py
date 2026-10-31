from datetime import date

from django.db import transaction

from apps.core.models import Sequence

PREFIXES = {"subscription": "SUB", "invoice": "INV", "payment": "PAY"}


def next_number(code: str, on: date | None = None) -> str:
    """Return the next gapless number, e.g. INV/2026/00042.

    Call inside the transaction that creates the document: the sequence row stays
    locked until commit, so concurrent creators queue instead of colliding, and a
    rollback gives the number back.
    """
    year = (on or date.today()).year
    prefix = PREFIXES[code]
    with transaction.atomic():
        # Race-free create-if-missing, then lock the row.
        Sequence.objects.bulk_create(
            [Sequence(code=code, year=year, prefix=prefix)], ignore_conflicts=True
        )
        seq = Sequence.objects.select_for_update().get(code=code, year=year)
        value = seq.next_value
        seq.next_value = value + 1
        seq.save(update_fields=["next_value"])
    return f"{prefix}/{year}/{value:05d}"
