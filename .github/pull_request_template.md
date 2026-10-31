## What
<!-- One or two lines: what this PR does. -->

## Why
<!-- Link the requirement (docs/ROADMAP.md row) or issue (#123). -->

## How to test
<!-- Exact steps, curl, or page to open. -->

## Screenshots
<!-- Required for UI changes. -->

## Checklist
- [ ] Only touches paths I own (docs/TEAM_PLAN.md), or the owner is tagged
- [ ] Rebased on latest `main`
- [ ] Matches docs/API.md (snake_case, error shape); types regenerated if the API changed
- [ ] Inputs validated on both sides (serializer + zod) with friendly messages
- [ ] No money math or status changes in the frontend
- [ ] Tests added/updated for business rules; `pytest` / `npm run build` pass locally
- [ ] No secrets, `.env` or dumps committed
- [ ] Migration created only for my own app (if any)
