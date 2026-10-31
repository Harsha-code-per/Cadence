# Demo Script & QA Matrix

> Owner: **M4**. Everyone runs the matrix on their slice before 16:15. Log failures as GitHub issues assigned to the owner.

## Accounts
The public demo logins are on the login page and in the README. They are read-only, so record the video with a writable local admin from `seed_demo`.

## Video story (about 6 minutes, everyone speaks)
Record from `main` on a local production build, so the flow can write data. Open with the live URL.

1. **Harsha (60 s)**: The problem: renewals missed, invoices typed by hand, nobody knows MRR. Landing page: invoices scattered as a galaxy collapse into one ledger. Architecture in one line: Django API, Next.js, PostgreSQL, no backend-as-a-service.
2. **Cholan (60 s)**: Sign up a customer. Password rules turn green, a duplicate email is refused. Log in as admin, add staff, show staff being blocked from admin pages. Show the demo logins being read-only.
3. **Loktrishal (75 s)**: Create a product with Brand = Odoo: 1,200 becomes 1,760. Create a plan and a quotation template. Create a "10% for 10+ seats" discount with a usage limit, without a code. Ask Cadence a finance question and show that the numbers come from our own database.
4. **Sanjjith (90 s)**: Create a subscription from the template, send, customer accepts, activate. The invoice appears with GST and the discount, with nobody attaching it. Preview billing as of next month, run it, run it again: 0 new invoices. Show the unique index that guarantees it, and the concurrency tests.
5. **Cholan (60 s)**: Record a partial UPI payment: still Confirmed. Record the rest: Paid. Dashboard moves, overdue aging. Portal: Asha pauses, is offered pause before cancel, resumes, and gets a 404 on someone else's invoice.
6. **Harsha (30 s)**: Database design: CHECK constraints, snapshots, partial indexes. Timings from the README, the footer timing badge, CI and the commit graph.

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
