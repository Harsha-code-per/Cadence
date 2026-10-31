# Cadence

**Recurring revenue, kept in time.** Cadence is a subscription management system: products and plans, quotations, subscriptions, automated recurring invoices, taxes, discounts, payments, a customer portal and a finance dashboard, in one place.

Built for the **Odoo Hackathon** problem statement *Subscription Management System* ("Brightloop Software").

| | |
|---|---|
| Live app | _added after first deploy_ |
| API docs | `<api>/api/docs/` (OpenAPI / Swagger) |
| Demo video | _added at submission_ |

## Why it exists
At Brightloop, subscriptions live in a spreadsheet, renewals depend on whoever remembers, invoices are typed by hand, payments are matched by scrolling bank statements, and nobody can say what the recurring revenue is. Cadence replaces each of those with a system that bills every subscription **exactly once, on time**, and shows the money picture live.

## What it does
- **Accounts and roles**: signup with a strict password policy, email reset links; admin / staff / customer roles; only admins add staff.
- **Catalog**: products (type, sales and cost price, notes), attribute-based variants (Brand = Odoo adds ₹560), taxes, payment terms.
- **Plans**: daily / weekly / monthly / yearly, minimum quantity, availability window, per-plan auto-close / close / pause / renew rules.
- **Quotations to subscriptions**: reusable quotation templates with a validity period; Draft → Quotation → Confirmed → Active → Closed (plus Paused), with a full timeline.
- **Billing engine**: invoices generated from subscriptions with lines, taxes and discounts; idempotent at the database level, catches up missed periods, runs on a schedule or on demand.
- **Discounts**: fixed or percentage, minimums, date window and usage limit, product- or subscription-scoped; applied automatically and stopped automatically.
- **Payments**: method, amount, date and note against an invoice; partial payments; paid / outstanding / overdue at a glance.
- **Finance dashboard**: active subscriptions, MRR/ARR, invoiced vs collected, outstanding and overdue, with filters.
- **Customer portal**: customers see and manage only their own subscriptions and invoices.

## Architecture
```mermaid
flowchart LR
    B[Browser] --> N[Next.js 16 · Vercel]
    N -->|/api/* rewrite, same origin| D[Django 6 + DRF · Render]
    D --> P[(PostgreSQL 17 · Neon)]
    D --> S[SMTP · Brevo]
    C[GitHub Actions cron] -->|signed| D
```
| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query/Table, react-hook-form + zod, Recharts |
| Landing | React Three Fiber, GSAP + ScrollTrigger, Lenis |
| Backend | Django 6, Django REST Framework, django-filter, drf-spectacular (OpenAPI) |
| Database | PostgreSQL 17 with CHECK constraints, partial unique and partial indexes |
| Auth | Django sessions + CSRF, Argon2 hashing |
| Ops | GitHub Actions (CI + billing scheduler), Docker Compose (local DB) |

More detail: [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA_MODEL.md) · [API](docs/API.md) · [Billing rules](docs/BILLING_RULES.md) · [Design system](docs/DESIGN.md) · [Deployment](docs/DEPLOYMENT.md) · [Roadmap](docs/ROADMAP.md) · [Demo](docs/DEMO.md)

### Database design highlights
- `UNIQUE (subscription_id, period_start) WHERE status <> 'cancelled'`: **a billing period can never be invoiced twice**, even by concurrent runs.
- `CHECK (total = subtotal - discount_total + tax_total)`, `CHECK (amount_paid <= total)`, `CHECK (status <> 'paid' OR amount_paid = total)`: money invariants enforced by Postgres.
- Price, name and tax-rate **snapshots** on subscription and invoice lines, so history never changes when the catalog does.
- Partial indexes for the two hottest queries: subscriptions due for billing and open invoices by due date.
- Discount usage and overdue status are **derived**, never stored, so they cannot drift.

## Quick start
```bash
docker compose up -d db
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && cp .env.example .env
python manage.py migrate && python manage.py seed_demo && python manage.py runserver
# new terminal
cd frontend && npm install && cp .env.example .env.local && npm run dev
```
Full instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Performance
_Measured on 5,000 subscriptions / 20,000 invoices; results added after seeding._

## Team
| Member | Role |
|---|---|
| [@Harsha-code-per](https://github.com/Harsha-code-per) | Database design, backend foundation, landing page, deployment |
| [@loktrishal-05](https://github.com/loktrishal-05) | Design system, frontend shell, catalog |
| [@Sanjjith27](https://github.com/Sanjjith27) | Subscriptions, billing engine, invoices |
| [@Cholan-kinnera](https://github.com/Cholan-kinnera) | Auth and roles, payments, dashboard, customer portal, QA |

How we work: [Engineering standards (six pillars)](docs/ENGINEERING_STANDARDS.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md) · Security: [SECURITY.md](SECURITY.md)

## License
[MIT](LICENSE)
