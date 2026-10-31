# Deployment & CI/CD

> Owner: **M1** (backend, DB, scheduler), **M2** (Vercel env check).
> Constraint: **free tiers only**, no BaaS. We host our own Django API and connect to a plain PostgreSQL server.

## Environments
| | Local | Production |
|---|---|---|
| Frontend | `npm run dev` → http://localhost:3000 | **Vercel** Hobby → `https://cadence-<team>.vercel.app` |
| Backend | `python manage.py runserver` → http://localhost:8000 (`/api/docs/`) | **Render** free web service (`render.yaml`) |
| Database | PostgreSQL 17 in **Docker** (`docker compose up -d db`) | **Neon** free Postgres (only a `DATABASE_URL`) |
| Email | console backend (printed in the runserver log) | **Brevo** SMTP relay `smtp-relay.brevo.com:2525` (Render free blocks 25/465/587) |
| Scheduler | `python manage.py run_billing` | GitHub Actions cron `*/15` → `POST /api/internal/billing/run/` |

> **Is Neon a BaaS?** No. Neon only hosts a standard PostgreSQL server. Django owns the schema, migrations, auth and business logic. Switching to any Postgres (Render, a VM, localhost) is a one-line env change.

## 1. Local setup
Prerequisites: Git, Docker, Python 3.13, Node 22+.

```bash
git clone https://github.com/Harsha-code-per/Cadence.git && cd Cadence
docker compose up -d db                       # Postgres 17 on localhost:5432 (busy? DB_PORT=5433 docker compose up -d db)

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate     # fish: source .venv/bin/activate.fish · Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_demo                    # demo users + catalog + subscriptions (add --subscriptions 5000 for perf)
python manage.py runserver                    # http://localhost:8000/api/docs/

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env.local                    # BACKEND_URL=http://localhost:8000
npm run gen:api                               # regenerate TS types from the running backend's OpenAPI
npm run dev                                   # http://localhost:3000
```
Reset the DB: `docker compose down -v && docker compose up -d db && python manage.py migrate && python manage.py seed_demo`.

## 2. Backend env (`backend/.env.example`)
| Var | Local | Prod |
|---|---|---|
| `DJANGO_SECRET_KEY` | any | Render `generateValue` |
| `DJANGO_DEBUG` | `true` | `false` |
| `DATABASE_URL` | `postgres://cadence:cadence@localhost:5432/cadence` | Neon pooled URL with `?sslmode=require` |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | `<service>.onrender.com` |
| `FRONTEND_URL` | `http://localhost:3000` | Vercel URL (used in reset links, CSRF trusted origins) |
| `EMAIL_URL` / `EMAIL_HOST`… | console | Brevo SMTP host/port/user/key |
| `DEFAULT_FROM_EMAIL` | `Cadence <no-reply@cadence.local>` | verified Brevo sender |
| `SCHEDULER_SECRET` | any | Render `generateValue`, copied into the GitHub secret |

## 3. Production (M1)
1. **Neon**: create project `cadence` (region: Singapore), copy the *pooled* connection string.
2. **Render**: New → Blueprint → this repo → `render.yaml`. Paste `DATABASE_URL`, `FRONTEND_URL`, SMTP vars. Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput`. Start: `python manage.py migrate --noinput && gunicorn config.wsgi --workers 2 --bind 0.0.0.0:$PORT`. Health check `/api/health/`.
3. **Seed prod** once from a local shell: `DATABASE_URL=<neon> python manage.py seed_demo --subscriptions 5000`.
4. **Vercel**: `cd frontend && vercel link && vercel env add BACKEND_URL production` (Render URL) → `vercel --prod`. Root directory: `frontend`.
5. **Brevo**: verify the sender email, create an SMTP key, put it in Render env.
6. **GitHub** → Settings → Secrets → Actions: `CADENCE_API_URL` (Render URL), `SCHEDULER_SECRET` (same as Render).
7. Smoke test: `/api/health/`, signup, login, DEMO story on the live URLs.

## 4. CI (GitHub Actions)
| Workflow | Trigger | Steps |
|---|---|---|
| `backend.yml` | PR / push touching `backend/**` | Postgres 17 service → `pip install -r requirements-dev.txt` → `ruff check` → `ruff format --check` → `python manage.py makemigrations --check --dry-run` → `pytest` |
| `frontend.yml` | PR / push touching `frontend/**` | `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm run build` |
| `scheduler.yml` | cron `*/15 * * * *` + manual | `curl -X POST $CADENCE_API_URL/api/internal/billing/run/ -H "Authorization: Bearer $SCHEDULER_SECRET"` (skips if secrets are unset). Also keeps Render warm. |

Branch protection on `main`: require PR + green checks, allow rebase-merge and merge commits, disallow squash.

## 5. Free-tier caveats
- Render free sleeps after 15 min idle (~50 s cold start): the cron ping mitigates it; open the app 2 min before judging.
- Render's filesystem is ephemeral: we store nothing on disk (no uploads; invoices print from HTML).
- GitHub cron can be delayed by minutes; that's fine because the billing engine catches up missed periods and admins have "Run billing now".
- Neon scales to zero; the first query after idle is slower (~1 s).
