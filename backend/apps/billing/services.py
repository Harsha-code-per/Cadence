"""Billing engine (owner: M3). Contract and algorithm: docs/BILLING_RULES.md §3–4."""

from datetime import date


def run_due_billing(today: date, limit: int = 500, triggered_by: str = "manual") -> dict:
    """Activate due subscriptions, auto-close expired ones, invoice every due period.

    Returns {"activated", "closed", "invoiced", "skipped", "ran_at"} and records a BillingRun.
    """
    raise NotImplementedError("M3: implement per docs/BILLING_RULES.md §4")
