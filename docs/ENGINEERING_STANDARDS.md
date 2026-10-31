# Engineering Standards: the six pillars

> **Every PR is judged against these six.** They are how we win: the judges score coding standards, logic, modularity, front-end design, performance, scalability, security, usability, debugging and database design. Each pillar below maps to those criteria and lists **concrete checks**, not slogans.
> The PR template has one checkbox group per pillar. Reviewers reject a PR that skips one.

| # | Pillar | Judges' criteria it covers | Gate |
|---|---|---|---|
| 1 | Code quality | coding standards, modularity, logic, debugging | ruff / eslint / tsc clean in CI |
| 2 | Problem-statement alignment | approach to the problem, attention to detail | every feature traced to a [ROADMAP](ROADMAP.md) row |
| 3 | Security | security | the checklist below + [SECURITY.md](../SECURITY.md) |
| 4 | Accessibility | usability, front-end design | keyboard + contrast + labels on every screen |
| 5 | Performance | performance, scalability, database design | < 2 s on the 5k-subscription dataset |
| 6 | Testing | debugging, logic | pytest for every rule that moves money or state |

---

## 1. Code quality
**Goal:** a reviewer can read any file and know where its logic lives and why.

- **Layering, no exceptions.** Backend: `urls → views → services → models` ([ARCHITECTURE §3](ARCHITECTURE.md#3-backend-layers-every-app-follows-this)). Business rules live only in `services.py` / `pricing.py` / `state.py`. Frontend: pages compose components; data fetching only through `lib/api.ts` + TanStack Query hooks.
- **Small units.** Functions do one thing (aim for < 40 lines); components < 200 lines, so split them. No file over ~400 lines without a reason.
- **Names say what, in the domain's words**: `confirm_subscription`, `outstanding`, `next_invoice_date`. Not `handle_data`, `temp`, `flag2`.
- **Types everywhere.** Python type hints on public functions; strict TS with no `any` (use the generated API types).
- **No dead code, no commented-out code, no `print`/`console.log`** in merged code (use `logging` on the backend).
- **One way to do each thing**: one error shape (`DomainError`), one table component (`DataTable`), one money formatter (`Money`), one status badge (`StatusBadge`). Reuse before writing.
- **Comments explain *why*, not *what*.** Every non-obvious rule links to the doc that defines it (`# BILLING_RULES §3: tax on the discounted amount`).
- **Errors are handled where they can be handled.** Services raise; views don't catch broadly; the UI shows every failure with a next step.
- **Commits** are conventional, small and from your own account ([CONTRIBUTING §4](../CONTRIBUTING.md#4-commit-messages-conventional-commits)).

## 2. Problem-statement alignment
**Goal:** every scene in the brief works end to end, using the brief's own words.

- **Trace it.** Each PR names the [ROADMAP](ROADMAP.md) row(s) it delivers. If a feature isn't in the roadmap, ask before building it.
- **Use the brief's vocabulary in the UI**: Draft / Quotation / Confirmed / Active / Closed; Draft / Confirmed / Paid; "payment terms", "quotation template", "minimum quantity". Judges compare the screen against the PDF.
- **Exact rules, not approximations**:
  - Password: **more than 8** characters + upper + lower + special.
  - One account per email.
  - Only admins add staff and create discounts.
  - Brand Odoo variant **+560**.
  - Billing periods are daily / weekly / monthly / yearly.
  - Plans carry their own auto-close / close / pause / renew flags.
  - Invoices are created from subscriptions, never typed.
  - Nothing is billed twice or skipped.
  - Discounts apply on their own and stop on expiry or usage limit.
  - Payments record method, amount, date and note.
  - Dashboard covers active subs, revenue, payments and overdue, with filters and a summary.
  - Pages respond in < 2 s at thousands of rows.
- **Real, dynamic data only.** No static JSON in the final product; mocks never reach `main`.
- **Demo the story.** Every slice owner can run their part of [DEMO.md](DEMO.md) on the deployed URL.

## 3. Security
**Goal:** a customer can never see or change what isn't theirs; money can never be forged from the browser.

- **Authorization on every endpoint**: an explicit `permission_classes` on each viewset (`IsAdmin`, `IsAdminOrStaff`, `IsAdminOrReadOnlyStaff`, `InternalOrCustomerReadOnly`). Never rely on hiding a button.
- **Customer scoping**: every customer-visible viewset uses `CustomerScopedMixin`, and out-of-scope objects return 404. Each owner adds one BOLA test (customer A requests customer B's object).
- **Never trust the client** for `status`, `customer`, `role`, `amount_paid`, totals or prices. These are read-only in serializers and set by services.
- **Validate at the boundary**: serializers validate every field (types, ranges, dates in order, positive money); zod mirrors it on the client for fast feedback; the DB constraints are the last line of defence.
- **Auth hygiene**: Argon2, throttled login/signup/reset, session rotated on login, reset tokens single-use and time-limited, identical responses for unknown emails.
- **Secrets** only in env vars. Never log passwords, tokens, reset links or full payment references.
- **ORM only**: no raw SQL built from strings. If raw SQL is truly needed, use parameters.
- **Audit** sensitive actions via `core.audit.record` (state changes, cancellations, payments, discounts, staff/role changes).
- **Frontend**: no `dangerouslySetInnerHTML`; external links get `rel="noopener noreferrer"`; no secrets in `NEXT_PUBLIC_*`.

## 4. Accessibility (WCAG 2.2 AA)
**Goal:** every screen works by keyboard, with a screen reader, at 200% zoom and on a phone.

- **Semantic HTML first**: real `<button>`, `<a href>`, `<table>` with `<th scope>`, `<label for>` on every input, one `<h1>` per page, headings in order.
- **Keyboard**: everything reachable with Tab in a logical order; a visible focus ring (`--plum`, 2px offset) on every interactive element; Esc closes dialogs; focus is trapped in dialogs and returned on close (shadcn/Radix does this, so don't break it).
- **Forms**: errors appear next to the field, are linked with `aria-describedby`, and focus moves to the first invalid field on submit. Required fields are marked in text, not only with color.
- **Color**: text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI borders). Status always has a label plus a dot, never color alone ([DESIGN §2](DESIGN.md#status-mapping-one-statusbadge-component-pill-shape)).
- **Targets** ≥ 44×44 px on touch; icon-only buttons have an `aria-label`.
- **Live feedback**: toasts (sonner) are announced; loading states use skeletons with `aria-busy`.
- **Motion**: honour `prefers-reduced-motion` everywhere; the landing has a static fallback.
- **Responsive**: usable at 360px wide; tables collapse to stacked rows or scroll inside their own box. The page itself never scrolls horizontally.
- **Check before PR**: tab through your page once, and run Lighthouse accessibility (target ≥ 95).

## 5. Performance
**Goal:** every page responds in under 2 seconds with 5,000 subscriptions and 18,000+ invoices (the brief's requirement), measured, not assumed.

- **Backend**:
  - Every list uses `select_related` / `prefetch_related`; no N+1, guarded by an `assertNumQueries` test on main lists.
  - Filter, sort, paginate and aggregate in PostgreSQL (`annotate`, `aggregate`, `Sum(..., filter=Q())`), never in Python loops.
  - Every filter you expose is backed by an index in [DATA_MODEL](DATA_MODEL.md); new filter = check `EXPLAIN ANALYZE`.
  - Page size 20, max 100. Never return unbounded lists.
  - Heavy summaries (dashboard, public stats) may be cached briefly; invalidate or keep the TTL ≤ 60 s.
- **Frontend**:
  - Server-side pagination/filtering only; debounce search (300 ms); TanStack Query caching with sensible `staleTime`.
  - Route-level code splitting; three.js/GSAP load only on the landing page (`next/dynamic`, `ssr: false`).
  - `next/font` for fonts, `next/image` for images; no layout shift (reserve space with skeletons).
  - Targets: Lighthouse performance ≥ 85 on the landing, ≥ 90 on app pages.
- **Measure**: run `seed_demo --subscriptions 5000`, time your endpoints (`curl -w "%{time_total}\n"`), and put the numbers in your PR description.

## 6. Testing
**Goal:** every rule that moves money or state is proven by a test that would fail if the rule broke.

- **Backend (pytest + pytest-django, real PostgreSQL in CI)**, minimum per slice:
  - **Pure logic** (`pricing.py`, period math, password validator): table-driven unit tests, including edge cases (month-end, rounding half-up, 0 and 100% discount, usage limit reached).
  - **Services**: each state transition (allowed and rejected), billing idempotency (run twice → one invoice), catch-up of missed periods, payment partial/full/overpayment, discount expiry.
  - **API**: one happy path per endpoint, validation errors return the API.md error shape, **role checks** (staff blocked from admin actions), **BOLA** (customer can't read others' records → 404).
  - **DB constraints**: the invariants in DATA_MODEL hold (see `tests/test_core_foundation.py` for the pattern).
- **Frontend**:
  - `npm run lint`, `tsc --noEmit` and `next build` must pass (CI).
  - The full [DEMO.md](DEMO.md) QA matrix run by hand on the deployed app before freeze; each failure becomes an issue for its owner.
- **Rules**: a bug fix comes with a test that reproduces it. CI must be green before merge, and no test is skipped to make it green.
- **Test names read as specs**: `test_running_billing_twice_creates_one_invoice`, `test_customer_cannot_read_another_customers_invoice`.
