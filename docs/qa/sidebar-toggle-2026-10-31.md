# Shared sidebar follow-up

User requested the familiar chat-app pattern: the top logo reveals the sidebar
control on hover, rather than a separate bottom collapse button. This is shared
across staff/admin app routes; the customer portal keeps its separate layout.

## Behavior

- Top 44×44 button shows the ledger mark normally and collapse/expand icon on
  hover or keyboard focus. Tooltip and accessible name describe the current action.
- `aria-expanded` reflects state; `aria-controls` points to the desktop navigation.
- The expanded wordmark remains a separate home link (no nested button/link).
- Touch/coarse-pointer devices always show the action icon, without needing hover;
  navigation targets are at least 44px high for those devices.
- Existing 248px expanded / 72px icon rail and local persistence remain. If storage
  writes fail, an in-memory fallback keeps toggling usable for that page session.
- Mobile keeps the navigation sheet and its home link, without a desktop toggle.
- Section/account-role labels now use the existing stronger foreground token.

## Actually run

- `npx eslint src`: passed.
- `npx next typegen`, then `npx tsc --noEmit`: passed.
- `npx next build`: passed, including optimized compilation, TypeScript and 24 static pages.
- Initial Impeccable detector on the two changed source files returned no findings;
  final refinements improved touch sizing and label contrast.
- Playwright `frontend/tests/sidebar-toggle.browser.js`: completed all assertions.
  Verified default logo, hover swap, mouse activation, ARIA state, Insights route
  and reload persistence, Enter/Space, a separate 1024px touch-emulated browser
  context, 44px touch links, rejected storage writes in another context, and 375px
  mobile sheet navigation to Products. Mobile document width 365px ≤ 375px viewport.
- Measured toggle bounds: x=12, y=6, 44×44 (old control was 36×36 at y=850).
- Computed section-label contrast against the sidebar surface: **6.69:1**.
- The final browser call exceeded the tool response timeout, but the script
  completed; its final in-page assertion report was retrieved and confirmed success.

Screenshots: [expanded/hover](sidebar-expanded-hover.png),
[collapsed](sidebar-collapsed.png), [mobile sheet](sidebar-mobile-sheet.png).

No backend or permission changes; no dependencies, manifests, landing files, or
environment files changed in this PR. Backend pytest/ruff were not run for this
frontend-only slice. Physical touch hardware, Safari/Firefox, screen-reader output,
Lighthouse and a whole-product accessibility audit were not tested.
