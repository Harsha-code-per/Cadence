# Team Plan (31 Oct 2026, 09:30 to 17:00 IST)

> **Everyone reads this first.** Ownership here is mirrored in [`.github/CODEOWNERS`](../.github/CODEOWNERS). Git rules: [CONTRIBUTING](../CONTRIBUTING.md).

## Roles: vertical slices (each member owns a Django app *and* its Next.js pages)

| Member | Mission | Owns |
|---|---|---|
| **M1** [@Harsha-code-per](https://github.com/Harsha-code-per) | The database is the product's spine, and the first impression is unforgettable | Repo, docs, CI, Django scaffold, `core`, **all models + initial migrations**, `seed_demo`, scheduler, **landing page**, deployment |
| **M2** [@loktrishal-05](https://github.com/loktrishal-05) | The app looks and feels like one product | Next.js scaffold, design system implementation, AppShell/Sidebar/DataTable/forms, `lib/api.ts`, **Catalog** (products, variants, attributes, taxes, payment terms, plans, discounts, quotation templates): API + UI |
| **M3** [@Sanjjith27](https://github.com/Sanjjith27) | Every subscription is billed exactly once, on time | **Subscriptions** (state machine, template → quotation → active, timeline) + **Billing engine** + **Invoices** (list, detail, confirm/cancel/send/print, "Run billing now"): API + UI |
| **M4** [@Cholan-kinnera](https://github.com/Cholan-kinnera) | Secure entry, clear money picture, happy customers | **Auth** (signup/login/reset email, roles, staff invite, route guard), **Customers**, **Payments**, **Analytics dashboard**, **Customer portal**, Insights (P2), QA against [DEMO](DEMO.md) |

## File ownership

Only the owner edits these paths. Need a change elsewhere? Ask the owner, or open a PR and tag them.

| Path | Owner |
|---|---|
| `backend/config/**`, `backend/apps/core/**`, `backend/requirements*.txt`, `backend/pyproject.toml` | M1 |
| `backend/apps/*/models.py` + `migrations/0001_initial.py` | M1 writes first; then the app owner |
| `backend/apps/catalog/**` (except models.py initial) | M2 |
| `backend/apps/subscriptions/**`, `backend/apps/billing/**` | M3 |
| `backend/apps/accounts/**`, `backend/apps/payments/**`, `backend/apps/analytics/**` | M4 |
| `backend/tests/test_<app>_*.py` | the app owner |
| `backend/apps/core/management/commands/seed_demo.py` | M1 |
| `docker-compose.yml`, `render.yaml`, `.github/workflows/**` | M1 (frontend.yml: M2) |
| `frontend/` scaffold, `package.json`, `next.config.ts`, `src/app/layout.tsx`, `globals.css` | M2 |
| `frontend/src/components/{ui,layout,data,forms}/**`, `src/lib/{api,api-types,format}.ts` | M2 |
| `frontend/src/app/(app)/{products,plans,taxes,discounts,quotation-templates,settings}/**` | M2 |
| `frontend/src/app/(app)/{subscriptions,invoices}/**`, `components/subscriptions/**`, `components/invoices/**` | M3 |
| `frontend/src/app/(auth)/**`, `(app)/{dashboard,customers,staff,payments,insights}/**`, `(portal)/**`, `components/{auth,dashboard,portal}/**`, `src/proxy.ts` | M4 |
| `frontend/src/app/page.tsx`, `components/landing/**` | M1 |
| `docs/{ARCHITECTURE,DATA_MODEL,API,DEPLOYMENT}.md` | M1 |
| `docs/BILLING_RULES.md` | M3 (§5–7: M4) |
| `docs/DESIGN.md` | M1 + M2 |
| `docs/DEMO.md` | M4 |
| `README.md`, `docs/{TEAM_PLAN,ROADMAP}.md` | M1 (anyone may PR) |

### Hot files, wired once (frozen afterwards)
| File | Wired by | Contains from the start |
|---|---|---|
| `backend/config/urls.py` | M1 | `include()` for **every** app's `urls.py` (each app ships an empty router) |
| `backend/config/settings.py` | M1 | every app in `INSTALLED_APPS`, DRF/spectacular/session/email config |
| `backend/requirements.txt` | M1 | all backend deps (incl. `python-dateutil`) |
| `frontend/package.json` | M2 | all frontend deps (incl. M1's landing libs: `gsap`, `@gsap/react`, `lenis`, `three`, `@react-three/fiber`) |
| `frontend/src/components/layout/Sidebar.tsx` | M2 | **every** nav link |
| `frontend/src/app/**/page.tsx` | M2 | a placeholder for **every** route, which the owner then replaces |

## Working rules
1. **Mock first, never wait.** Until an endpoint lands, build against the example JSON in [API.md](API.md). Mocks never reach `main`.
2. **Contract is frozen.** Field-name change = team message + API.md update + `npm run gen:api` in the same PR.
3. **No money math in the frontend.** Show what the API returns.
4. **Migrations**: after M1's initial set, only the app owner runs `makemigrations <their_app>`. Rebase before generating one.
5. **Commit from your own account at least once an hour**, and merge at least one PR per hour. **Rebase-merge only, never squash.**
6. Stuck for more than 15 min? Say so in the team chat.

## Timeline

| Time | M1 | M2 | M3 | M4 |
|---|---|---|---|---|
| **09:30–10:00** | Docs + repo hygiene on `main` (this commit) | Read docs; first commit: handle check in `TEAM_PLAN`; install Node 22+ | Read docs + BILLING_RULES; first commit | Read docs; first commit |
| **10:00–11:00** | Django scaffold, `core`, **all models + constraints + migrations**, admin, stub routers, health, CI. **Merge by 11:00** | `create-next-app`, Tailwind v4 + shadcn themed from DESIGN.md, AppShell + full Sidebar + placeholder pages, `lib/api.ts`, CI. **Merge by 11:00** | Pure `billing/pricing.py` (period math, discount, tax, rounding) + unit tests (no DB needed) | Auth UI (login/signup/forgot/reset) with zod; draft auth serializers/views against the User model in DATA_MODEL |
| **11:00–12:00** | `seed_demo` (realistic dataset), Claude Design landing assets, start landing | Products + variants/attributes, taxes, payment terms (API + UI) | Subscription API: create, from-template, state actions, events | Auth endpoints wired, session + CSRF, `proxy.ts`, staff invite (admin), customers CRUD |
| **12:00–13:00** | Landing: hero shader + scroll story | Plans, quotation templates (API + UI) | Subscription UI: list, create from template, detail with actions + timeline | Password reset email (console locally), customers UI |
| **13:00–14:00** | Scheduler endpoint + workflow; `public/stats`; help M3 review billing | Discounts (admin only), DataTable polish, empty/loading states | `billing/services.py` engine + invoices API (+ run, confirm, cancel) + idempotency test | Payments API + record-payment dialog + outstanding/overdue views; analytics summary API |
| **14:00–14:30** | **First production deploy** (Neon + Render + Vercel) | Vercel env + rewrite check | Invoice list/detail UI, "Run billing now" | Dashboard page (KPIs + charts) |
| **14:30 ✅ CHECKPOINT** | **Signup → admin creates product (Odoo +560) → plan → template → quotation → confirm → active → invoice with tax → partial + full payment → dashboard moves.** If this fails, everybody stops features and fixes it. | | | |
| **14:30–15:30** | Landing polish + live stats band; seed 5k in prod; timings | UI consistency pass across all pages, responsive, dark mode | Discount on invoices, send (email) + print view, renew/pause/close in UI | Customer portal (own subs, invoices, payments, allowed actions) |
| **15:30–16:15** | README screenshots, perf numbers, security pass | Keyboard focus, a11y, micro-interactions | Edge-case tests (expired quote, double run, cancel frees discount) | Insights (P2) if green; QA the full DEMO matrix, log bugs to owners |
| **16:15–17:00** | 🧊 **Feature freeze.** Bug fixes only, final deploy, record the demo video (everyone speaks), submit the repo link | ← | ← | ← |

## Checkpoints
| Time | Must be true |
|---|---|
| 11:00 | Both scaffolds merged; `docker compose up -d db && python manage.py migrate` works for everyone; `npm run dev` shows the full sidebar |
| 12:00 | Login works; products persist in Postgres via the UI |
| 13:00 | Template → quotation → confirm → active from the UI |
| 14:00 | Billing run creates invoices; running it twice creates nothing new; payment updates balance |
| 14:30 | Full flow **on the deployed URLs** |
| 16:15 | Feature freeze, CI green on `main` |

## Presentation split (everyone speaks)
| Member | Talks about |
|---|---|
| M1 | Problem framing, **database design** (constraints, partial unique index, snapshots, indexes), architecture, deployment |
| M2 | Design system, UX decisions, catalog + variants (Odoo +560 live) |
| M3 | Live lifecycle demo: template → active → billing run (run it twice, still one invoice) |
| M4 | Security (roles, scoping, password policy, reset), payments, dashboard, portal, testing |
