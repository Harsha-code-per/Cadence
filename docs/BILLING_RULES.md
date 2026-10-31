# Billing Rules

> Owner: **M3** (subscriptions, billing), **M4** (payments §5, analytics §6). Tables: [DATA_MODEL](DATA_MODEL.md).
> Every rule here is enforced **in the backend service layer** (and by DB constraints where possible). The frontend only displays what the API returns.

## 1. Subscription state machine (`apps/subscriptions/state.py`)

```
draft ──send──▶ quotation ──confirm──▶ confirmed ──activate──▶ active ──close──▶ closed
  ▲                │                                    │   ▲
  └────revise──────┘                              pause │   │ resume
                                                        ▼   │
draft/quotation ──cancel──▶ closed                      paused ──close──▶ closed
active/closed ──renew──▶ (new subscription in quotation, renewed_from = this)
```

| Transition | Allowed from | Guard (else `400 invalid_transition` / `validation_error`) | Side effects |
|---|---|---|---|
| `send` | draft | ≥1 line; plan available today (`start_date ≤ today ≤ end_date`); Σ quantity ≥ `plan.min_quantity` | `valid_until = today + template.validity_days` (or 30 if no template) |
| `revise` | quotation | | back to draft, `valid_until = null` |
| `confirm` | quotation | `valid_until ≥ today` (else `quotation_expired`) | |
| `activate` | confirmed | `start_date ≤ today` (the billing run also activates confirmed subs whose start date arrives) | `next_invoice_date = start_date`; **bill the first period immediately** |
| `pause` | active | `plan.pausable` | not billed while paused |
| `resume` | paused | | **shift by the paused duration**: `next_invoice_date += today − paused_at` (`paused_at` = time of the latest `→ paused` SubscriptionEvent; no extra column). The customer never pays for paused days and never loses paid days. |
| `close` | active, paused | `plan.closable` (staff/admin can always close draft/quotation as *cancel*) | `close_reason` stored |
| auto-close | active, paused | `plan.auto_close AND expiration_date < today` | done by the billing run, actor = system |
| `renew` | active, closed | `plan.renewable` | new subscription, status `quotation`, lines copied, `start_date = old.expiration_date + 1 day` (or today) |

Every transition writes a `SubscriptionEvent(from, to, actor, note)` and an `AuditLog`. **The API never accepts `status` in a PATCH body.** State only changes via `POST /api/subscriptions/{id}/<action>/`.

Editing lines/plan/customer is only allowed in `draft` (and `quotation`, which bounces it back to draft).

## 2. Billing periods
- `period_start = next_invoice_date`
- **Anchor day, no drift.** The anchor is `start_date.day`. For monthly and yearly plans, the next period start is `period_start + relativedelta(months=n, day=anchor)` (or `years=n`). `relativedelta(day=31)` clamps to the month's last day, so a 31 Jan start bills **31 Jan → 28/29 Feb → 31 Mar → 30 Apr**, never drifting to the 28th forever. Daily and weekly plans use `days=` / `weeks=`.
- `period_end = next_period_start − 1 day`.
- After invoicing: `next_invoice_date = next_period_start`.
- Unit-test the anchor: start 31 Jan monthly → starts 31 Jan, 29 Feb (2028), 31 Mar.
- No invoice is generated for a period starting after `expiration_date`.
- `invoice_date = period_start` (billing in advance); `due_date = invoice_date + payment_term.due_days`.

## 3. Invoice calculation (`apps/billing/pricing.py`, pure functions, unit-tested)
For each billable line (the plan-fee line first if `plan.price > 0`, then every subscription line):
1. `amount = quantity × unit_price`
2. **Discount** (at most one per invoice). Rules without a code apply on their own to every subscription that qualifies, so nobody has to remember them; a coded discount applies once attached to the subscription. Of everything eligible, the customer gets the biggest saving:
   - Eligible if: `is_active`; `start_date ≤ invoice_date ≤ end_date (or no end)`; `usage_limit` is null or `redemptions < usage_limit` (checked with the discount rows **locked**); invoice subtotal ≥ `min_amount`; Σ quantity ≥ `min_quantity`.
   - `scope = product`: applies only to lines whose product is in `discount.products`.
   - `scope = subscription`: applies to all lines.
   - `percent`: `discount_amount = round(amount × value / 100)` per line.
   - `fixed`: split across eligible lines proportionally to `amount`; the last line takes the rounding remainder; never more than the eligible amount.
3. **Tax** on the discounted amount, per tax on the line: `tax = round((amount − discount_amount) × rate / 100)`. Each tax is snapshotted into `InvoiceLineTax`.
4. `line.total = amount − discount_amount + Σ tax`
5. Invoice: `subtotal = Σ amount`, `discount_total = Σ discount_amount`, `tax_total = Σ tax`, `total = subtotal − discount_total + tax_total` (also a DB CHECK).

Rounding: `Decimal.quantize(Decimal("0.01"), ROUND_HALF_UP)` **per line, per tax**. No floats anywhere.

If the discount is ineligible (expired, used up, below minimum), the invoice is created **without** it. That's "stop when it expires or runs out" with no human involvement.

## 4. Billing engine (`apps/billing/services.py`)

```python
def generate_invoice(subscription_id, today) -> Invoice | None:
    with transaction.atomic():
        sub = Subscription.objects.select_for_update().get(pk=subscription_id)
        if sub.status != "active" or sub.next_invoice_date > today: return None
        period = compute_period(sub)
        if sub.expiration_date and period.start > sub.expiration_date: return None
        lines = price_lines(sub, period, today)          # §3, locks discount row
        try:
            with transaction.atomic():                   # savepoint
                invoice = Invoice.objects.create(... status="draft", number=next_number("invoice"))
                InvoiceLine/InvoiceLineTax/DiscountRedemption bulk_create(...)
        except IntegrityError:                           # uq_invoice_period hit: already billed
            invoice = None
        sub.next_invoice_date = period.end + 1 day
        sub.save(update_fields=["next_invoice_date", "updated_at"])
        audit("invoice.generate", ...)
    return invoice

def run_due_billing(today, limit=500) -> BillingRunResult:
    activate confirmed subs whose start_date <= today
    auto-close expired subs (plan.auto_close)
    ids = Subscription.objects.filter(status="active", next_invoice_date__lte=today) \
            .select_for_update(skip_locked=True).values_list("id")[:limit]
    for id in ids: loop generate_invoice until next_invoice_date > today (catch-up of missed periods)
    return counts {activated, closed, invoiced, skipped}
```

Guarantees:
- **Never billed twice**: the partial unique index; a second run hits `IntegrityError` and skips.
- **Never skipped**: the catch-up loop bills every missed period up to today; the scheduler runs every 15 min *and* admins have a "Run billing now" button.
- **Concurrent runs** don't block each other (`skip_locked`).

**Billing-day simulator (demo superpower).** `run_due_billing(today, dry_run=True)` runs the exact same code inside `transaction.atomic()` and then rolls back (raise a private `_DryRun` exception carrying the counts, catch it outside the atomic block). It returns what *would* happen: `{activated, closed, invoiced, skipped, total_billed, discounts_applied}`. The admin UI's "Run billing now" dialog takes a **"Bill as of" date** (default today) and has a **Preview** button (dry run) next to **Run billing**. Judges can bill next month live in seconds, then preview again and see `invoiced: 0`.

Triggers (all call `run_due_billing`):
| Trigger | Who |
|---|---|
| `python manage.py run_billing [--date YYYY-MM-DD]` | dev / demo |
| `POST /api/billing/run/ {date?, dry_run?}` | admin dialog on the Invoices page (Preview / Run billing, "Bill as of" date) |
| `POST /api/internal/billing/run/` with `Authorization: Bearer $SCHEDULER_SECRET` | GitHub Actions cron `*/15 * * * *` (`.github/workflows/scheduler.yml`) |

## 5. Invoice lifecycle and payments
```
draft ──confirm──▶ confirmed ──(payments sum = total)──▶ paid
  │                    │
  └──cancel──▶ cancelled ◀──cancel (only if amount_paid = 0)
```
- `confirm`: draft only. Bulk: `POST /api/invoices/confirm-bulk/ {ids}`.
- `cancel`: draft or confirmed with `amount_paid = 0`; deletes its `DiscountRedemption` (frees discount usage).
- `send`: confirmed or paid; emails the customer a summary + portal link; sets `sent_at`.
- `print`: frontend route `/invoices/[id]/print` with print CSS (`window.print()`); no PDF library.
- **Payment** (`apps/payments/services.py::record_payment`): lock the invoice row; reject if the status is not `confirmed` (`invoice_not_payable`); reject if `amount > total − amount_paid` (`overpayment`); create the Payment; `amount_paid += amount`; if it equals the total → `paid`. Partial payments are allowed.
- **Outstanding** = `total − amount_paid` for confirmed invoices. **Overdue** = confirmed and `due_date < today` (derived, filterable via `?overdue=true`).

## 6. Analytics definitions (M4, `apps/analytics/services.py`)
| Metric | Definition |
|---|---|
| Active subscriptions | `COUNT(*) WHERE status='active'` |
| MRR | Σ over active subs of (plan.price + Σ line qty×unit_price) normalized to a month: daily ×30.4375, weekly ×52/12, monthly ×1, yearly ÷12, all ÷ interval_count. Excludes discounts and tax. |
| ARR | MRR × 12 |
| Revenue (invoiced) | Σ `total` of confirmed+paid invoices with `invoice_date` in the range |
| Collected | Σ `payment.amount` with `payment_date` in the range |
| Outstanding | Σ `total − amount_paid` of confirmed invoices |
| Overdue | count + Σ outstanding where `due_date < today` |

All aggregates run as single SQL queries (`aggregate`/`annotate` with `Sum`, `Count`, `filter=Q(...)`), never Python loops.

## 7. Gross margin guardrail (cost price has a job)
The brief asks for a product's cost price. We use it:
- Variant margin: `margin % = (price − cost_price) ÷ price × 100`, shown on the product and variant forms (M2).
- Subscription line margin after discount: `(unit_price − line discount per unit − cost_price) ÷ (unit_price − discount per unit)`, shown per line on the subscription detail (M3).
- **Warning, not a block**: when a discount would take any line's net price below `cost_price`, the discount form and the subscription detail show an amber "Below cost on Brightloop CRM: −₹120 per seat" notice. `cost_price` is **never** sent to customers (portal serializers exclude it).

## 8. Receivables aging (M4)
Overdue confirmed invoices are bucketed by days past `due_date`: **1–7, 8–30, 31–60, 60+**. One SQL query with `Case/When` over `idx_inv_open_due`. Shown on the dashboard's overdue panel with counts and amounts; each bucket links to the filtered invoice list (`?overdue=true&aging=8-30`).

## 9. "Why did my bill change?" (M3 detail page, M4 portal)
On an invoice, compare it to the previous non-cancelled invoice of the same subscription and list the differences in plain words: quantity changes, a new or removed line, a discount that started, expired or ran out, a tax rate change. Computed on read (`GET /api/invoices/{id}/` → `changes: [{kind, description, amount_delta}]`), not stored. This answers the customer's first question before they email anyone.

## 10. Insights (P2, rule-based, no LLM)
Churn-risk score per active subscription (0–100) from: number of overdue invoices, days past due, recent pause events, expiration within 30 days with no renewal, and a decrease in quantity. Show the top 10 with the reasons listed. Deterministic and explainable.
