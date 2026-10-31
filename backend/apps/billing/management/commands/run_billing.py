import json
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.billing.services import run_due_billing


class Command(BaseCommand):
    help = "Run recurring billing for due subscriptions."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Run date in YYYY-MM-DD format")
        parser.add_argument(
            "--limit", type=int, default=500, help="Maximum subscriptions to process"
        )
        parser.add_argument("--dry-run", action="store_true", help="Roll back all changes")

    def handle(self, *args, **options):
        try:
            today = date.fromisoformat(options["date"]) if options["date"] else timezone.localdate()
        except ValueError as exc:
            raise CommandError("Date must use YYYY-MM-DD format.") from exc
        if not 1 <= options["limit"] <= 500:
            raise CommandError("Limit must be between 1 and 500.")
        result = run_due_billing(
            today, limit=options["limit"], triggered_by="command", dry_run=options["dry_run"]
        )
        self.stdout.write(json.dumps(result))
