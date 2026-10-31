## What
<!-- One or two lines: what this PR does. -->

## Roadmap row(s)
<!-- docs/ROADMAP.md rows delivered, or the issue (#123). -->

## How to test
<!-- Exact steps, curl, or page to open. -->

## Screenshots / timings
<!-- UI changes: screenshot or GIF. List/dashboard endpoints: curl -w "%{time_total}" on the 5k seed. -->

## Six-pillar checklist (docs/ENGINEERING_STANDARDS.md)
**Code quality**
- [ ] Logic lives in services/pricing/state (backend) or hooks/components (frontend), not in views or pages
- [ ] Lint, format and type checks pass; no dead code, `print` or `console.log`
- [ ] Only touches paths I own (docs/TEAM_PLAN.md), or the owner is tagged; rebased on latest `main`

**Problem-statement alignment**
- [ ] Matches the brief's exact rule and wording for this feature; matches docs/API.md (types regenerated if the API changed)
- [ ] Uses real API data (no static JSON or mocks left in)

**Security**
- [ ] Explicit permission classes; customer-visible data uses `CustomerScopedMixin`
- [ ] Status, amounts, customer and role are never accepted from the client; inputs validated (serializer + zod)
- [ ] No secrets, `.env` or dumps committed

**Accessibility**
- [ ] Keyboard-only walkthrough done; visible focus; labelled inputs; errors next to fields
- [ ] Contrast AA; status shown with text, not color alone; works at 360px wide

**Performance**
- [ ] No N+1 (`select_related`/`prefetch_related`); filters indexed; lists paginated
- [ ] Frontend: server-side pagination/filters, debounced search, no heavy libs outside the landing

**Testing**
- [ ] Tests for new rules, including the rejected paths, role checks and BOLA where relevant
- [ ] `pytest` / `npm run build` pass locally; CI green
