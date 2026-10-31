# Contributing

Four people, one day, one `main`. These rules exist so nobody spends 16:30 resolving merge conflicts, and so every line we ship meets the same bar.

## 0. The six pillars (read [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md))
Every PR is reviewed against all six. A PR that skips one is sent back.

| Pillar | In one line |
|---|---|
| **Code quality** | Layered (`views → services → models`), small typed units, one way to do each thing, lint/type-check clean |
| **Problem-statement alignment** | Every feature traces to a [ROADMAP](docs/ROADMAP.md) row and uses the brief's exact rules and words |
| **Security** | Explicit permissions on every endpoint, customer scoping (404 outside scope), never trust client-sent status/amounts |
| **Accessibility** | Semantic HTML, full keyboard use, visible focus, labelled fields, AA contrast, status never color-only |
| **Performance** | No N+1, SQL aggregates, indexed filters, paginated lists; < 2 s on the 5k-subscription seed, measured |
| **Testing** | pytest for every rule that moves money or state, plus role and BOLA tests; bug fixes come with a test |

## 1. Golden rules
1. **Edit only files you own** ([ownership map](docs/TEAM_PLAN.md#file-ownership)). CODEOWNERS auto-requests the owner's review if you don't.
2. **Never commit to `main` directly.** Branch → PR → CI green → merge.
3. **Rebase about every 45 minutes** and push small PRs early. **At least one merged PR per member per hour.**
4. **The API contract is frozen** ([docs/API.md](docs/API.md)). Changing a field = tell the team + update the doc + regenerate types in the same PR.
5. **No money math in the frontend.** Totals, taxes, discounts and balances come from the API.
6. **Commit from your own GitHub account.** The judges look at who did what.

## 2. Branches
`<type>/<scope>-<short-desc>`, e.g. `feat/catalog-plans`, `feat/billing-engine`, `fix/auth-reset-expiry`, `docs/demo-script`.
Short-lived: one branch per feature, merged within ~1 hour.

## 3. Daily loop
```bash
git switch main && git pull --ff-only
git switch -c feat/<scope>-<desc>

# work, commit small and often
git status                       # check before adding, never `git add -A` blindly
git add <your files>
git commit -m "feat(catalog): add variant price preview"

# sync (every ~45 min and before opening a PR)
git fetch origin
git rebase origin/main
git push --force-with-lease      # only on YOUR branch

gh pr create --fill              # or via the web UI; the template loads automatically
```
Merge with **"Rebase and merge"** (or a merge commit). **Never "Squash and merge"**: it rewrites authorship onto whoever clicks the button.
Rebase went wrong? `git rebase --abort` and ask. Never force-push `main`.

## 4. Commit messages ([Conventional Commits](https://www.conventionalcommits.org/))
```
<type>(<scope>): <imperative summary, ≤ 72 chars>

optional body: what and why
```
| type | use for |
|---|---|
| `feat` | new user-visible behavior |
| `fix` | bug fix |
| `refactor` | code change without behavior change |
| `test` | tests only |
| `docs` | documentation only |
| `style` | formatting only |
| `chore` | deps, config, tooling |
| `ci` | GitHub Actions |
| `perf` | performance |

Scopes: `core`, `db`, `accounts`, `auth`, `catalog`, `subscriptions`, `billing`, `invoices`, `payments`, `analytics`, `portal`, `ui`, `landing`, `deploy`, `ci`, `docs`.

## 5. Pull requests
- Fill in the PR template; it has one checklist group per pillar. Tick only what you actually did.
- Put measured endpoint timings in the description when you add or change a list or dashboard endpoint.
- Keep PRs under ~400 changed lines when possible (migrations and generated types excluded).
- UI PRs include a screenshot or GIF.
- Review within 10 minutes when tagged. "LGTM, ran it locally" beats a perfect review at 16:30.
- CI must be green before merge.

## 6. Code style

### Python (backend)
- Python 3.13, type hints on public functions, **ruff** (`ruff check . && ruff format .`).
- Layers: `urls → views → services → models` ([ARCHITECTURE §3](docs/ARCHITECTURE.md#3-backend-layers-every-app-follows-this)). Views never contain business rules; services never return HTTP responses.
- Services raise `DomainError("code", "Friendly message", field_errors={...})`.
- `snake_case` functions/fields, `PascalCase` classes, `*_id` FKs. Money is always `Decimal`.
- Every service that moves money or state has a pytest. Customer-facing viewsets use `CustomerScopedMixin`.

### TypeScript (frontend)
- Strict TS, eslint (Next config) + prettier.
- Components `PascalCase.tsx`; hooks `useThing.ts`; route folders kebab-case.
- API calls only via `lib/api.ts`; types only from the generated `lib/api-types.ts` (never edit by hand: `npm run gen:api`).
- Forms: react-hook-form + zod; show server `field_errors` on the matching fields.
- Only design tokens from [DESIGN.md](docs/DESIGN.md) (Tailwind theme vars). No ad-hoc hex colors or one-off font sizes.

## 7. Dependencies
Need a new one? Ask the owner of the manifest (M1: `requirements.txt`, M2: `package.json`). They add it in a tiny separate PR, so lockfile conflicts never happen in feature branches.

## 8. Database changes
Initial models and migrations are written by **M1**. After that, **only the app owner** runs `python manage.py makemigrations <app>`, after rebasing on `main`. Two migrations in the same app from different branches = conflict, so coordinate in chat.

## 9. Secrets
Never commit `.env`, keys, passwords or dumps. Copy `.env.example` → `.env`. If a secret is committed by mistake: tell the team, **rotate it**, then remove it. See [SECURITY.md](SECURITY.md).
