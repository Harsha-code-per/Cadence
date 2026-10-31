# Pipeline layout correction

## Requested behavior

All six stages fit in one desktop row with consistent width/padding. Cards extend
down the document, not inside short, independently scrolling columns. On smaller
screens the grid becomes 3 / 2 / 1 columns rather than squeeze unreadable cards.

## Implementation

- Six equal columns from the existing `xl` breakpoint (1280px), 12px desktop gaps,
  12px header/card-list padding and 12px between cards. Stage hints wrap instead
  of truncate, plan/amount rows stack, and reference text can wrap when needed.
- Only the pipeline route opts out of the shell's 1400px content cap, using its
  data attribute; other routes retain their existing width.
- Removed the 26rem / viewport-height list constraint and `overflow-y-auto`.
  Sections have a useful viewport-relative minimum drop area and grow with cards.
- Replaced growing first-page limits (previously capped at 100) with explicit
  paged append. Each click fetches at most 12 cards (6 for Closed). No eager loading
  of the entire dataset. Retry keeps already loaded cards in place.
- State-machine moves, permission decisions, totals, money formatting and backend
  endpoints remain unchanged. Tests performed no subscription writes.

## Browser measurements (local real records)

| Viewport | Sidebar | Columns per row | Column width | List overflow |
|---|---|---:|---:|---|
| 1366×900 | expanded | 6 | 166.66px | visible, not clipped |
| 1920×900 | expanded | 6 | 258.93px | visible, not clipped |
| 1440×900 | collapsed | 6 | 208.27px | visible, not clipped |
| 1024×900 | collapsed | 3 | 287.20px | visible, not clipped |
| 768×900 | collapsed | 2 | 310.80px | visible, not clipped |
| 375×900 | mobile | 1 | 332.80px | visible, not clipped |

No page horizontal overflow at any tested size. At desktop all six stage tops
aligned and widths differed by less than one pixel. Keyboard End scrolled the
document; all six card lists retained scrollTop=0.

Screenshots use real local records: [six stages](pipeline-six-columns.png),
[mobile](pipeline-mobile.png).

## Checks actually run

- `npx eslint src`: passed.
- `npx next typegen`, then `npx tsc --noEmit`: passed.
- `npx next build`: passed, including optimized compilation and 24 static pages.
- Impeccable detector on board and shell: no findings.
- `frontend/tests/pipeline-layout.browser.js`: passed. After real-record layout
  checks, isolated browser API fixtures verified an empty column, long names,
  append through 110 cards, maximum request page size 12, a next-page failure
  preserving the first 12 cards followed by successful retry, and the allowed
  move menu (Quotation present, invalid Active move absent). No action was submitted.
  The four expected 503 console entries came from the intentional retry fixture.

No backend changes, dependencies, manifests, landing edits or secrets in this PR.
Backend pytest/ruff were not run for this frontend-only change. No physical device,
Safari/Firefox, actual drag/drop transition, production deployment, whole-product
accessibility audit or 5k performance benchmark was tested.
