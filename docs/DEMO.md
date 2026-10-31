# Demo Script & QA Matrix

> Owner: **M4**. Everyone runs the matrix on their slice before 16:15. Log failures as GitHub issues assigned to the owner.

## Demo accounts (created by `python manage.py seed_demo`)
Credentials live in `backend/.env.example` comments for local use only. Production demo passwords are shared privately, never committed.

| Role | Email |
|---|---|
| Admin | `admin@brightloop.test` |
| Staff | `staff@brightloop.test` |
| Customer | `asha@raotraders.test` |

## Story (≈ 6 minutes, everyone speaks)
1. **M1 (60 s)**: Landing page: the cycle dial and the "month at Brightloop" scroll. Then the problem ("renewals missed, invoices wrong, nobody knows MRR") and the architecture slide.
2. **M4 (60 s)**: Sign up a new customer live. Show the password feedback (weak → each rule turns green) and the duplicate-email error. Log in as admin, add a staff member, try the same as staff (blocked).
3. **M2 (60 s)**: Admin creates product "Brightloop CRM" with variant Brand=Odoo; the price shows +560. Create the plan "Growth monthly" (pausable, closable). Create a discount "10% for 10+ seats", usage limit 3.
4. **M3 (90 s)**: Staff picks the quotation template → quotation (valid 15 days) → customer accepts in the portal → activate → invoice INV/… appears with GST and the discount. Click **Run billing now** twice: still one invoice for the period. Confirm, send, print.
5. **M4 (60 s)**: Record a partial UPI payment → status stays confirmed with outstanding shown; record the rest → Paid. Dashboard: MRR, collected and outstanding move. Overdue list. The customer portal shows only Asha's data (try another invoice ID in the URL → 404).
6. **M1 (30 s)**: Database design: partial unique index, CHECK constraints, snapshots; perf numbers on 5k subscriptions; CI and the commit graph.

## QA matrix
| # | Scenario | Expected | Owner |
|---|---|---|---|
| 1 | Signup with an existing email in different case | "An account with this email already exists." on the email field | M4 |
| 2 | Password `abcdefgh` / `Abcdefgh1` / `Abcdefgh!` (8) | each rejected with the specific rule; `Abcdefgh!x` accepted | M4 |
| 3 | Forgot password for an unknown email | same success message (no enumeration) | M4 |
| 4 | Reset link used twice / after 1 h | second use rejected: "This link has expired. Request a new one." | M4 |
| 5 | Staff opens `/staff` or POSTs `/api/staff/` | redirected / 403 | M4 |
| 6 | Customer opens another customer's invoice by ID | 404 | M4 |
| 7 | Variant with Brand=Odoo on a 1200 product | price 1760 | M2 |
| 8 | Plan with end date before start date | field error on end date | M2 |
| 9 | Staff tries to create a discount | 403, button hidden | M2 |
| 10 | Percent discount of 120 | field error | M2 |
| 11 | Send a quotation with qty below plan min | `validation_error` naming the minimum | M3 |
| 12 | Confirm an expired quotation | `quotation_expired` | M3 |
| 13 | PATCH `status` directly | ignored / 400 | M3 |
| 14 | Pause on a non-pausable plan | button absent; API 400 | M3 |
| 15 | Run billing twice on the same day | 1 invoice per period, second run `invoiced: 0` | M3 |
| 16 | Subscription 3 periods behind | 3 invoices with consecutive periods | M3 |
| 17 | Discount usage limit 1, two subscriptions billed | only the first invoice has the discount | M3 |
| 18 | Cancel an invoice with a payment | blocked with a message | M3 |
| 19 | Payment larger than outstanding | `overpayment` on the amount field | M4 |
| 20 | Partial then full payment | confirmed → paid; outstanding 0 | M4 |
| 21 | Dashboard numbers vs SQL | match the queries in BILLING_RULES §6 | M4 |
| 22 | Lists with 5k seeded subscriptions | < 2 s (record timings) | M1 |
| 23 | Landing with reduced motion / no WebGL | static dial, no pinning, all content readable | M1 |
| 24 | Mobile 375px: dashboard, subscription list, portal | usable, no horizontal scroll | M2 |
