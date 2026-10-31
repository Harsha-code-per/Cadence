# Landing scroll follow-up

Newly requested after the earlier PR cutoff. Scope: scrolling only; no content,
3D geometry, visual redesign, dependencies or manifest changes.

## Change and measurements

Removed Lenis's custom wheel interpolation. The browser now handles wheel and
trackpad momentum; ScrollTrigger still follows native scrolling. Pinned holds are
viewport-aware and shorter; scrub catch-up is 0.3 seconds rather than 0.6–0.7.

At 1440×900 in local Next dev:

| Measure | Before | After |
|---|---:|---:|
| Full document height | 13,046 px | 10,600 px |
| Statement extra hold | 1,500 px | 585 px |
| Month strip extra hold | 1,274 px | 1,019 px |
| Billing extra hold | 2,400 px | 1,125 px |
| Combined extra hold | 5,174 px | 2,729 px |

The page is about 19% shorter, and extra pinned distance about 47% shorter.
All seven month scenes and the final billing/rerun message remain reachable.
[Final billing state screenshot](landing-shorter-scroll.png).

## Actually run

- `node --test tests/scroll-distance.test.mjs`: 2 passed; bounded short/tall viewports.
- `npx eslint src`: passed.
- `npx next typegen`, then `npx tsc --noEmit`: passed.
- Impeccable detector on the five changed source targets: no findings.
- Playwright `frontend/tests/landing-scroll.browser.js`: passed. One coarse 120px
  wheel input and four 30px fine inputs each moved the page 120px. Statement words
  completed, the last month card was visible, final billing step appeared and
  keyboard End reached the closing CTA. Reduced-motion produced zero pins; at
  375×812 document width 365px stayed within the viewport.
- Additional desktop checks at the hero and y=5400 found document width 1430px
  within the 1440px viewport and no overflowing section/canvas.

The browser runner needed to wait for queued native wheel events and completed
GSAP states rather than assume fixed delays. Physical mouse/trackpad feel,
Safari/Firefox, production deployment and Lighthouse were not tested. No backend
code changed, so backend checks were not run for this slice. Native TypeScript
unit tests emitted Node's existing module-type warning; manifests were unchanged.
