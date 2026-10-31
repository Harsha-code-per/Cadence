# Roadmap: every brief requirement, traced

P0 = must ship by the 14:30 checkpoint · P1 = by 16:15 freeze · P2 = only if everything is green.

| Brief scene | Requirement | Priority | Owner | Where |
|---|---|---|---|---|
| A new customer signs up | Signup with email + password; one account per email (case-insensitive) | P0 | M4 | `accounts`, `/signup` |
| | Password > 8 chars, upper, lower, special (backend validator + zod) | P0 | M4 | `accounts/validators.py` |
| | Reset link sent to the registered email | P0 | M4 | `/forgot-password`, SMTP |
| | Roles: admin (all), staff (limited), customer (own data via portal) | P0 | M4 | `core.permissions`, `proxy.ts` |
| | Only admin can add staff | P0 | M4 | `/api/staff/`, `/staff` |
| Launching a new plan | Product: name, type, sales price, cost price, notes | P0 | M2 | `catalog`, `/products` |
| | Variants by attribute; Brand=Odoo adds 560 | P0 | M2 | Attribute/Value/Variant |
| | Plan: price, daily/weekly/monthly/yearly, min qty, availability dates | P0 | M2 | `/plans` |
| | Per-plan flags: auto-close, closable, pausable, renewable | P0 | M2 + M3 | Plan flags + state machine |
| Turning a quote into a subscription | Quotation templates with plan + product lines + validity days | P0 | M2 | `/quotation-templates` |
| | Subscription: number, customer, plan, start, expiry, payment terms, lines (product, qty, unit price, taxes, amount) | P0 | M3 | `/subscriptions/new` |
| | Draft → Quotation → Confirmed → Active → Closed, visible to the team | P0 | M3 | state machine + timeline |
| Billing day | Invoices generated from subscriptions with customer, lines, taxes, totals | P0 | M3 | billing engine |
| | Taxes calculated automatically from admin rules | P0 | M3 | `pricing.py` |
| | Confirm, cancel, send, print | P0 (send/print P1) | M3 | invoice actions |
| | Draft → Confirmed → Paid | P0 | M3 + M4 | |
| | Nothing billed twice or skipped (partial unique index + catch-up loop + scheduler) | P0 | M3 + M1 | |
| A better price | Admin-only discount rules: fixed/percent, min purchase/qty, dates, usage limit | P0 | M2 | `/discounts` |
| | Scope: products or whole subscription; auto-applied on the next invoice; stops when expired/used up | P1 | M3 | `pricing.py` |
| The money comes in | Record payment: method, amount, date, note, against an invoice | P0 | M4 | `/payments` |
| | Paid vs outstanding vs overdue visible at any moment | P0 | M4 | filters + dashboard |
| The finance lead | Active subs, revenue, payments, overdue, with filters + summary view | P0 | M4 | `/dashboard` |
| | Every page < 2 s with thousands of subscriptions | P1 | M1 (+ all) | indexes, seed 5k, timings in README |
| Customer self-service | Portal: own subscriptions, invoices, payments; plan-allowed actions | P1 | M4 | `/portal` |
| Judges' asks | Landing page / first impression | P1 | M1 | `/` |
| | Rule-based churn-risk insights | P2 | M4 | `/insights` |
| | Dark mode | P2 | M2 | |
| | CSV export of invoices | P2 | M3 | |

## Differentiators (from the team's master-report review)
Adopted because they prove a brief requirement live or close a real failure mode, at low cost. Rejected ideas and why are at the bottom.

| Feature | Proves | Priority | Owner |
|---|---|---|---|
| **Billing-day simulator**: "Bill as of" date + dry-run Preview on the billing dialog | Scene 4 "nothing billed twice or skipped", live in seconds | P1 | M3 |
| **Anchor-day billing** (31 Jan → 29 Feb → 31 Mar, no drift) | Scene 4 correctness | P0 (part of the engine) | M3 |
| **Pause shift**: resume moves the next invoice by the paused days | Scene 2 pause rule | P1 | M3 |
| **Server-Timing header** + tiny "11 ms · 3 queries" badge in the app footer | Scene 7 "< 2 s", measured on every page | P1 | M1 header ✅, M2 badge |
| **Gross margin + below-cost warning** (cost price is used, never shown to customers) | Scene 2 cost price has a purpose | P1 | M2 product forms, M3 subscription lines |
| **Receivables aging buckets** 1–7 / 8–30 / 31–60 / 60+ | Scene 6 "chase overdue before it's lost" | P1 | M4 |
| **"Why did my bill change?"** on invoice detail and portal | Scene 1 portal "without having to email anyone" | P2 | M3 (API) + M4 (portal) |
| **Pause-before-close** prompt in the portal on pausable plans | Scene 2 pause rule, customer retention | P2 | M4 |
| **Quotation expiring soon** badge (≤ 2 days) | Scene 3 validity days | P1 | M3 |
| **Demo persona switcher** on the login page (only when `NEXT_PUBLIC_DEMO_MODE=true`; logs in seeded demo users) | Lets judges try all three roles in one click | P2 | M4 |
| **Jury Q&A prep**: [JURY_QA.md](JURY_QA.md) | Everyone can defend every decision | ✅ | all |

Not adopted (and why): JWT/Redis/FastAPI/microservice layers (we have sessions + one modular monolith); materialized views and cursor pagination (indexes already keep us far under 2 s at 5–10k; we'll show measurements instead); credit wallet and mid-cycle proration (not in the brief, and they add money paths to get wrong); hash-chained audit log (our append-only AuditLog covers the need); bank-CSV auto-matcher and magic-link quote acceptance (good, but only if everything else is green: P3).
