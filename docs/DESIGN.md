# Design System

> Owners: **M1** (landing) + **M2** (app implementation). The visual reference is the Claude Design artifact linked at the bottom; this file holds the exact tokens. **Use only these tokens.** No ad-hoc hex values or font sizes.

## 1. Idea
**Cadence = rhythm.** Subscription revenue is a beat: daily, weekly, monthly, yearly cycles running at once. Our visual language is built from **cycles and ticks**: rings, period bars and timelines, never decorative blobs.

- **Audience**: Brightloop's admin, staff and finance lead (dense, all-day ERP use) and their customers (occasional portal visits).
- **Primary job**: make "where does every subscription and every rupee stand right now?" answerable at a glance.
- **Nod to the judges**: the base hue is **Odoo-adjacent aubergine**, and the accent is the **marigold highlighter** used in the problem statement PDF.

## 2. Color tokens
Define these as CSS variables in `globals.css` and expose them through the Tailwind v4 `@theme`. Map the shadcn variables (`--background`, `--primary` …) onto them.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | `#2A1730` | `#F3EEF5` | primary text, sidebar background (light mode) |
| `--ink-2` | `#5E4B66` | `#B9AEC0` | secondary text |
| `--ink-3` | `#8E8095` | `#7F7387` | placeholders, disabled |
| `--canvas` | `#F3F1F6` | `#17101A` | app background (cool mist, **not** cream) |
| `--surface` | `#FFFFFF` | `#211826` | panels, tables, dialogs |
| `--line` | `#E3DDE8` | `#35293B` | borders, dividers |
| `--plum` | `#6B3F69` | `#C38DC0` | primary actions, links, focus ring |
| `--plum-soft` | `#F1E8F0` | `#3A2540` | selected rows, primary-tinted backgrounds |
| `--marigold` | `#F2AE2E` | `#F2B84B` | **the single accent**: active nav marker, "now" tick, highlights. Max one per view. |
| `--marigold-soft` | `#FDF1D8` | `#3D2E12` | highlight wash (like the PDF's highlighter strokes) |
| `--teal` | `#17806F` | `#4CC3AE` | success · paid · active |
| `--rose` | `#C2364F` | `#F07088` | danger · overdue · destructive |
| `--amber` | `#B7791F` | `#E3AD55` | warning · paused · quotation expiring |
| `--slate` | `#6B7280` | `#9CA3AF` | neutral · closed · cancelled |

Contrast: all text tokens meet WCAG AA on `--surface` and `--canvas`. Never put marigold text on white (use `--ink` on `--marigold-soft`).

### Status mapping (one `StatusBadge` component, pill shape)
| Domain | Status → token |
|---|---|
| Subscription | draft → slate · quotation → plum · confirmed → plum (solid) · **active → teal** · paused → amber · closed → slate (muted) |
| Invoice | draft → slate · confirmed → plum · **paid → teal** · cancelled → slate + strikethrough · **overdue (derived) → rose** |
| Payment method | neutral outline badge |

Badge = dot + label in sentence case ("Active", "Overdue 12 days"). Never color alone: the label always carries the meaning.

## 3. Typography
| Role | Family | Notes |
|---|---|---|
| Display (landing headlines, page titles, big KPI numbers) | **Bricolage Grotesque** (variable, `next/font/google`) | Use the width/optical axis: titles 600, landing hero 700 at tight tracking (-0.03em) |
| UI + body + tables | **IBM Plex Sans** (400/500/600) | Enterprise/finance heritage; enable `font-variant-numeric: tabular-nums` on all money and table cells |

Two families, clearly distinct. **No monospace for labels.** Amounts use Plex with tabular figures, right-aligned.

Type scale (rem, ratio ≈ 1.25, base 15px in the app, 17px on the landing):
`xs .75 · sm .8125 · base .9375 · md 1.0625 · lg 1.25 · xl 1.5625 · 2xl 1.953 · 3xl 2.441 · 4xl 3.052 · hero clamp(3.5rem, 8vw, 7.5rem)`
Line-height: body 1.55, tables 1.35, display 1.02. Body line length ≤ 72ch.

Copy rules: **sentence case everywhere**, no all-caps eyebrows, no "→" glued to buttons. Buttons say exactly what happens ("Confirm invoice", "Record payment", "Run billing now"), and the toast echoes the action ("Invoice confirmed").

## 4. Shape, space, elevation
- Spacing: 4px grid (`1 = 4px`). Page padding 24px (16px mobile). Section gap 32px.
- **Radius hierarchy** (not one radius for everything): inputs/buttons `6px` · panels/tables/dialogs `10px` · badges/pills `999px` · landing feature frames `20px`.
- Elevation: **borders, not shadows**, for resting surfaces (`1px var(--line)`). The only shadow is on floating layers (dropdowns, dialogs, toasts): `0 12px 32px -12px rgb(42 23 48 / .28)`.
- Density: table row height 44px (compact toggle 36px). Forms single-column ≤ 560px wide, two-column for line editors.

## 5. App layout

```
┌────────────┬──────────────────────────────────────────────────────┐
│ ◐ Cadence  │  Subscriptions                    [search] [+ New]   │  ← PageHeader: title (Bricolage), primary action right
│            │  ─────────────────────────────────────────────────── │
│ Overview   │  [Status ▾] [Plan ▾] [Customer ▾]   1–20 of 5,321    │  ← FilterBar, URL-synced
│ Customers  │  ┌─────────────────────────────────────────────────┐ │
│ Subscript.▌│  │ SUB/2026/00041  Rao Traders  Growth  ● Active    │ │  ← DataTable on --surface, 10px radius
│ Invoices   │  │ ...                                              │ │
│ Payments   │  └─────────────────────────────────────────────────┘ │
│ ─ Catalog  │                                                      │
│ Products   │                                                      │
│ Plans      │                                                      │
│ Discounts  │                                                      │
│ Taxes      │                                                      │
│ Templates  │                                                      │
│ ─ Admin    │                                                      │
│ Staff      │                                                      │
│ [user ▾]   │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```
- **Sidebar**: `--ink` background (aubergine) in light mode, 248px, collapsible to icons. The active item has a **3px marigold bar** on the left (the app's one signature accent). Groups: *Workspace* (Overview, Customers, Subscriptions, Invoices, Payments), *Catalog* (Products, Plans, Discounts, Taxes, Quotation templates), *Admin* (Staff, Settings). Items hidden by role.
- **Detail pages**: two columns at ≥1280px: main (lines, invoices) + 320px side rail (customer, dates, **CycleRing**, timeline).
- **Portal**: no sidebar; a top bar with the customer's company name; cards for each subscription with a CycleRing; invoice list below.
- **Mobile (<768px)**: the sidebar becomes a sheet; tables become stacked rows showing number, customer, status and amount.

### Signature component: `CycleRing`
A small SVG ring (48–96px) showing progress through the current billing period: a track in `--line`, progress in `--plum`, a marigold tick at "today", and the label "Next invoice 1 Nov". Used on the subscription detail, portal cards and the landing hero (in 3D). It makes the product's idea visible in the UI itself.

### Dashboard (finance lead)
Top row: four KPI tiles (Active subscriptions · MRR · Collected this month · Outstanding), number in Bricolage 2xl with tabular figures, and a delta vs last month in teal/rose with the label. Below: revenue series (invoiced vs collected, Recharts area/bar, plum + teal), status breakdown, an **overdue list** (rose) with a "Record payment" action. Filters: date range, plan.

## 6. Motion (app)
- Purposeful only: dialogs/sheets 160ms ease-out; row expand 200ms; a toast on every mutation.
- State change feedback: when a subscription transitions, the StatusBadge cross-fades and the timeline gains its new entry (motion answers the action).
- No entrance animations on page load in the app. `prefers-reduced-motion` disables all non-essential motion.

## 7. Landing page (M1), the one place we spend boldness
Libraries (landing only, lazy-loaded): **React Three Fiber + three**, **GSAP + ScrollTrigger**, **Lenis**.

1. **Hero: "the cycle dial."** Full-viewport aubergine. On the right, a WebGL dial of four concentric orbit rings (daily, weekly, monthly, yearly). Hundreds of small particles (subscriptions) orbit at speeds proportional to their real cycle, and a **marigold sweep hand** rotates. When it passes a particle, that particle flashes (an invoice is issued) and a tiny counter increments. On the left, left-aligned: headline in Bricolage hero size: **"Recurring revenue, kept in time."** Sub: "Plans, subscriptions, invoices and payments for businesses that earn every month, in one system." Buttons: "Open the live demo" (primary marigold on ink) and "Create an account". One orchestrated load: the rings draw in, then the hand starts. That's the only autoplay motion on the page.
2. **"A month at Brightloop"**: a pinned horizontal scroll through the brief's real sequence (numbering is honest here because it is a timeline): *Day 1 a customer signs up → Day 3 a new plan launches → Day 8 a quote becomes a subscription → Day 15 billing day → Day 18 a better price → Day 22 the money comes in → Day 30 the finance lead's view.* Each panel shows a real UI fragment (actual React components with demo data, not screenshots) and one sentence.
3. **"Money that can't go wrong."** The database guarantees shown typographically: the actual partial unique index SQL and CHECK constraints set large on `--ink`, each with a one-line plain-English caption ("A billing period can never be invoiced twice."). This speaks directly to the judges.
4. **Three roles**: admin, staff, customer, each with what they can do.
5. **Live band**: real numbers from `GET /api/public/stats/` (active subscriptions, invoices issued, MRR). Real dynamic data, not static JSON.
6. **Closing CTA** + a minimal footer (team names, GitHub).

Quality floor: responsive down to 360px (the hero dial moves behind the text at 30% opacity on mobile), keyboard focus visible, `prefers-reduced-motion` → static SVG dial + no pinning, WebGL fallback to SVG, Lighthouse performance ≥ 85.

## 8. Implementation notes (M2)
- `next/font/google`: `Bricolage_Grotesque` (variable `--font-display`), `IBM_Plex_Sans` (400/500/600, `--font-sans`).
- shadcn components to add first: button, input, label, select, textarea, dialog, sheet, dropdown-menu, table, badge, tabs, tooltip, popover, calendar, command, skeleton, separator, sonner, form.
- Shared components: `PageHeader`, `FilterBar`, `DataTable`, `StatusBadge`, `Money`, `DateText`, `EmptyState` (sentence: what's missing + the action to create it), `ConfirmDialog`, `CycleRing`, `KpiTile`.
- Icons: lucide-react, 16px in tables, 18px in nav, stroke 1.75.

## 9. Claude Design reference
- Design system artifact: _link added by M1 after generation_
- Landing concept artifact: _link added by M1 after generation_
