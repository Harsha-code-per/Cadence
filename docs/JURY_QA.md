# Jury Q&A: defend every decision

> Everyone presents, so everyone should be able to answer any of these. Each answer names **what we built** and **the proof to show** (a test, a query, a screen). The owner listed answers first; anyone may add to it.

## Accounts and access (M4)
| # | Question | Our answer | Proof |
|---|---|---|---|
| 1 | "More than eight characters": is an 8-character password accepted? | No. `len > 8` plus upper, lower and special, enforced by `CadencePasswordValidator` on the server and mirrored in zod. `Abcdef!1` (8) is rejected; `Abcdefgh!x` passes. | `test_password_policy_rejects` |
| 2 | Can `John@Shop.com` and `john@shop.com` both register? | No. Emails are lowercased on save and protected by `UNIQUE (LOWER(email))` in Postgres, so even a race can't create two. | `test_email_is_unique_case_insensitively` |
| 3 | Can I send `"role": "admin"` in the signup JSON? | No. The signup serializer has no `role` field; the service always creates a `customer`. Staff are created only via `POST /api/staff/`, which is admin-only. | role test, 403 for staff |
| 4 | Reset link clicked twice, or requested for an unknown email? | Django's token generator: the token is tied to the password hash, so it dies on use and expires in 1 h. Unknown emails get the same 204 response (no account enumeration). Throttled. | QA #3, #4 |
| 5 | Customer A opens customer B's invoice by ID? | 404. Customer querysets are filtered by `CustomerScopedMixin` before lookup, so B's invoice doesn't exist for A. | BOLA tests |
| 6 | Can staff create a discount through Postman? | No. `IsAdminOrReadOnlyStaff` is on the viewset; hiding the button is only cosmetic. | 403 test |

## Catalog and plans (M2)
| # | Question | Our answer | Proof |
|---|---|---|---|
| 7 | If the CRM price goes 1,200 → 1,500, does the Odoo variant follow? | Yes. A variant's price is computed (`sales_price + Σ attribute extras`), so it becomes 2,060 for new quotes. | variant price test |
| 8 | …and what happens to an active subscription signed at 1,760? | Nothing. Subscription lines **snapshot** `unit_price` at creation; invoices snapshot names and tax rates too. Contracts and history never change retroactively. | DATA_MODEL "snapshots" |
| 9 | Why does the brief ask for a cost price? | We use it: live margin % on products and subscription lines, and a below-cost warning when a discount would sell under cost. Customers never see it. | BILLING_RULES §7 |
| 10 | A plan with an end date before its start date? | Rejected twice: serializer field error, and `CHECK (end_date IS NULL OR end_date >= start_date)` in Postgres. | QA #8 |

## Subscriptions (M3)
| # | Question | Our answer | Proof |
|---|---|---|---|
| 11 | Can I PATCH `status: "active"` directly? | No. `status` is read-only; state only changes through `POST /subscriptions/{id}/<action>/`, which checks an explicit transition table, locks the row and records an event + audit entry. | QA #13, state tests |
| 12 | Confirming a quotation after its validity date? | Rejected with `quotation_expired`. Validity = template's `validity_days` from the send date. | state test |
| 13 | Quantity below the plan's minimum? | `send` refuses until Σ quantity ≥ `plan.min_quantity`; line edits are re-validated. | QA #11 |
| 14 | A customer pauses for 15 days. Do they pay for it? | No. Paused subscriptions aren't billed, and resume shifts the next invoice date by the paused days, so nobody loses or gains days. | BILLING_RULES §1 |
| 15 | Monthly plan started 31 January? | Anchor-day billing: 31 Jan → 29 Feb → 31 Mar → 30 Apr. No permanent drift to the 28th. | anchor unit test |

## Billing (M3)
| # | Question | Our answer | Proof |
|---|---|---|---|
| 16 | I click "Run billing" twice, or the cron and a human run it at the same moment. | One invoice per period, guaranteed by Postgres: partial unique index `(subscription_id, period_start) WHERE status <> 'cancelled'`. Runs use `SELECT … FOR UPDATE SKIP LOCKED`, so concurrent runs don't even wait for each other. | live: run twice → `invoiced: 0`; idempotency test |
| 17 | The server was down for 3 days. Are those periods skipped? | No. The engine loops each subscription until `next_invoice_date > today`, billing every missed period. | catch-up test |
| 18 | Can you show next month's billing without waiting a month? | Yes. The billing dialog takes a "Bill as of" date and has a dry-run Preview that runs the real engine in a transaction and rolls back. | live demo |
| 19 | A 3-use discount on its 4th invoice? Or after it expires? | Not applied, automatically. Eligibility is checked at invoice time with the discount row locked; usage = `COUNT(redemptions)`, so it can't drift. Cancelling an invoice frees its use. | discount tests |
| 20 | How are taxes and rounding done? | Discount first, then each tax on the discounted line amount, `Decimal` with ROUND_HALF_UP per line per tax, and every tax snapshotted on the invoice. `CHECK (total = subtotal − discount + tax)` in Postgres. | `pricing.py` tests |

## Payments and finance (M4)
| # | Question | Our answer | Proof |
|---|---|---|---|
| 21 | Pay ₹100 more than the balance? | Rejected (`overpayment`) under a row lock; also `CHECK (amount_paid <= total)`. Partial payments are fine; the invoice becomes Paid exactly when fully paid (`CHECK (status <> 'paid' OR amount_paid = total)`). | QA #19, #20 |
| 22 | How is "overdue" stored? | It isn't. It's derived (`confirmed AND due_date < today`), so it can never be stale. Aging buckets: 1–7, 8–30, 31–60, 60+. | dashboard |
| 23 | Annual invoices spike January revenue. Is that your MRR? | No. MRR is normalized contract value (yearly ÷ 12, weekly × 52/12, daily × 30.4375); invoiced revenue and collected cash are shown separately. | BILLING_RULES §6 |
| 24 | Is it really under 2 seconds with thousands of rows? | Measured on 5,000 subscriptions and 18,000 invoices; every API response carries a `Server-Timing` header with DB time and query count, shown in the app footer. Hot queries hit partial indexes. | live badge, README numbers |

## Architecture and engineering (M1)
| # | Question | Our answer | Proof |
|---|---|---|---|
| 25 | Why Django and not a BaaS? | The judges asked for real database design: we own the schema, constraints, migrations, auth and business logic. Neon only hosts a standard Postgres reached through `DATABASE_URL`, swappable in one line. | DEPLOYMENT |
| 26 | Why a monolith? | One transaction can create an invoice, record a discount use and advance the subscription together. Microservices would turn that into distributed consistency problems for no benefit at this scale. | ARCHITECTURE §1 |
| 27 | How do you stop N+1 queries? | `select_related`/`prefetch_related` in every list queryset, guarded by `assertNumQueries` tests, and visible live in the Server-Timing query count. | tests, badge |
| 28 | What if the scheduler (GitHub cron) is late? | Billing is idempotent and catches up, and admins can run it on demand, so a late cron delays nothing visible. | BILLING_RULES §4 |
| 29 | How did four people avoid stepping on each other? | Vertical slices with CODEOWNERS, hot files wired once, one migration owner per app, rebase-merge only, CI on every PR. Commit history shows each member's own work. | git log, PRs |
| 30 | What would you do next for production? | Real payment gateway with signed webhooks, per-tenant data, background workers for email, and monitoring alerts on billing-run failures. | — |
