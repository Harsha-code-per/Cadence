# Ask Cadence — local verification, 31 October 2026

## Demo explanation

1. An admin/staff question reaches a read-only GET endpoint. Customer access is denied.
2. Personal lookups are refused, and a fixed finance vocabulary redacts unknown words
   before sending question text outside the app. The model selects one of five tools.
3. The server validates that selection and calls one existing analytics aggregate.
   The model never writes SQL and never receives raw records or churn-insight results.
4. A second call phrases only those numbers. The UI shows the answer, tool name and
   unchanged source JSON together, so the narration can be checked against the source.
5. With no key/configuration the question box disappears; existing Insights still works.

Configure all three server-only environment variables in the gitignored environment:
`ASSISTANT_API_KEY`, `ASSISTANT_API_URL` (full HTTPS chat completions endpoint), and
`ASSISTANT_MODEL`. Never put the key in the browser, source, PR, or chat.

## Checks actually run

- `py -3.14 -m pytest -q` against local PostgreSQL: **234 passed**.
- `py -3.14 -m ruff check .`: passed.
- `py -3.14 -m ruff format --check .`: passed (99 files).
- OpenAPI TypeScript regenerated from the local Django schema with `openapi-typescript`.
- `npx eslint src`: passed.
- `npx next typegen`, then `npx tsc --noEmit`: passed.
- `npx next build`: passed (optimized compilation, TypeScript and all 23 static pages).
- Playwright ran `frontend/tests/ask-cadence.browser.js` while logged in as the writable
  local admin. Real no-key status returned disabled and the box was absent. Mocked
  assistant responses then verified keyboard submission, label/300-character limit,
  exact displayed JSON, unsupported questions, friendly 503 and 429 states, and no
  horizontal page overflow at 375px. Five submissions generated exactly five GETs.
  Aging numbers came from the real local database; provider wording was mocked.

Backend tests cover both permitted roles and all five real aggregate functions,
actual 61-day-overdue invoice arithmetic, invalid tool rejection, customer/anonymous
denial, demo GET access, disabled state, question validation, per-user rate limiting
and expiration, personal-detail redaction, transport timeout/request shape, malformed
and oversized provider responses, both provider stages failing, and unsafe URLs.

Screenshots use mocked provider wording, not a live model:
[desktop](ask-cadence-desktop.png) · [375px](ask-cadence-375.png).

## Timing and limits

One local APIClient GET selecting aging: **164.5 ms total**, middleware **135.3 ms**,
one aggregate query (**4.3 ms**). Provider calls were mocked: **network/model latency
is excluded**. This is not the production 5k-dataset performance measurement.
Each provider request has a 10-second timeout; two requests may take about 20 seconds.
The current Django LocMemCache counter is process-local; multiple workers need a
shared cache to enforce one global limit. No dependency or cache-infrastructure change
is included. Model grounding is prompted, not a proof of semantic accuracy; source
numbers remain visible for verification.

## Failures fixed during verification / not tested

- A large parametrized fixture initially exceeded Windows' environment-variable limit
  through pytest's auto-generated test ID. Explicit short IDs fixed it; full rerun passed.
- Ruff initially flagged an unused exception variable and a literal vocabulary split;
  both fixed and full checks rerun.
- An initial timing invocation used an unallowed test host; rerun used localhost.
- A live provider key was not available. Real routing/wording, provider compatibility,
  live-provider latency and production deployment are **not verified**.
- No Lighthouse/contrast audit or physical-device test was performed.
- Test environment emits existing staticfiles/email deprecation warnings.
