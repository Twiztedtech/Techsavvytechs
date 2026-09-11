---
name: TechSavvy CRM
colors:
  crm-canvas: "#F3F5F4"
  crm-header: "#101812"
  crm-accent-tint: "#E8F7ED"
  tech-green: "#22C55E"
  tech-green-deep: "#15803D"
  safety-orange: "#FF8C00"
  dark-panel-canvas: "#020617"
  dark-panel-surface: "#0F172A"
---

# Design System: TechSavvy CRM
**Project ID:** techsavvytechs.com /crm — internal admin workspace
**Relationship to the marketing-site system:** this is a companion doc, not a
duplicate. The CRM shares the parent brand's core tokens (tech-green, safety
orange, Montserrat/Inter/JetBrains Mono) documented in `../DESIGN.md`, but its
actual UI is a distinct, denser, admin-tool visual language that doc doesn't
cover in depth. Read this file for anything CRM-specific; fall back to the
parent doc only for brand-level facts (logo construction, marketing-page
layout, email branding) that don't apply inside the app shell.

## 1. Visual Theme & Atmosphere — two co-existing languages

The CRM is **not visually uniform today**, and that split is real, current
behavior worth designing around rather than a rendering bug:

**A. Core CRM shell** (`src/pages/CRM.tsx` — Customers, Quotes, Jobs,
Invoices, Materials & Stock, Customer Assets, Reports, Reminders, Audit
Trail, Schedule & Dispatch): a **light, dense, data-table workspace**. Near-
white canvas (`#F3F5F4`), white cards with hairline `border-slate-200`,
barely-rounded corners (`rounded`, not `rounded-xl`), and tech-green used
sparingly as an accent rather than a dominant surface color — this is the
brand's marketing-site palette turned down to "admin tool" volume. The one
dark surface left in this half is the top header bar (`#101812`).

**B. Ported admin-parity modules** (`src/features/admin/*.tsx` —
Contractor Roster, Timecard Approval, Support Tickets — plus
`src/features/client/ClientRequestsAdmin.tsx`): **dark glass-panel cards**
(`bg-slate-950`/`bg-slate-900`, `border-slate-800`), noticeably larger
corner radii (`rounded-xl`, `rounded-2xl`), and a semantic status palette
(amber/emerald/rose/indigo) that **does not use tech-green or safety-orange
at all**. These modules were extracted from the old ContractorDashboard admin
mode and mounted into the CRM shell as-is — they carry that surface's dark
"ops console" look rather than the CRM's own light theme.

If you are asked to design a new CRM screen and no other instruction is
given, **build it in language A** (light shell) — it's the majority of the
app and the one that matches the parent brand doc's "CRM modals flip to a
light surface" note. Only use language B's dark-panel look if you are
extending one of the four modules already built that way, for visual
continuity within that module.

## 2. Color Palette & Roles

### Core CRM shell (language A)
- **Canvas** `#F3F5F4` — page background behind all cards (`bg-[#f3f5f4]`).
- **Header band** `#101812` — sticky top bar; near-black, slightly warmer
  than the marketing site's pure `#0B0F0C`.
- **Card surface** — plain white (`bg-white`) with `border-slate-200` and
  `shadow-sm`. No blur/glass effect here, unlike the marketing site.
- **Sidebar active state** `#E8F7ED` bg + `tech-green-deep` (`#15803D`)
  text — the CRM's signature "selected nav item" and "eyebrow chip" tint,
  reused for audit-log entity-type badges and the Reminders icon chip.
- **Tech Green** `#22C55E` — primary buttons (`bg-tech-green
  text-brand-black`, e.g. "Create new"), the live-sync status dot, sidebar
  wordmark accent. Notably *not* the dominant color of the workspace — most
  surfaces are neutral slate/white, with green reserved for calls to action
  and confirmation states.
- **Tech Green Deep** `#15803D` — the far more common of the two greens in
  this half of the CRM: active nav text, breadcrumb current-page color,
  work-order/reference-number mono text, link-style buttons.
- **Safety Orange** — the CRM's sign-out avatar chip only
  (`bg-safety-orange` "TT" button). Otherwise absent; semantic warning color
  is `orange-600`/`amber`-family Tailwind defaults instead (see semantic
  palette below), not the brand's safety-orange token.
- **Primary CTA dark variant** `#17251b` — a near-black forest green used
  on ~20 buttons throughout (Export/Download snapshot, Add item, Add asset,
  etc.) as `bg-[#17251b] text-white`. This is a *third* green in active use
  alongside tech-green and tech-green-deep — treat it as the CRM's
  "secondary-primary" button fill, one step down from the bright
  tech-green CTA.

### Semantic / status palette (core CRM shell)
Defined once as a shared `tones` map and reused for every KPI tile, badge,
and status pill in language A:
| Tone | Classes |
|---|---|
| sky | `border-sky-400/20 bg-sky-400/10 text-sky-600` |
| orange | `border-orange-400/20 bg-orange-400/10 text-orange-600` |
| green | `border-green-500/20 bg-green-500/10 text-green-700` |
| violet | `border-violet-400/20 bg-violet-400/10 text-violet-600` |
| red | `border-red-400/20 bg-red-400/10 text-red-600` |
| blue | `border-sky-400/30 bg-sky-400/20 text-sky-800` |
| purple | `border-violet-400/30 bg-violet-400/20 text-violet-800` |
| slate | `border-slate-400/20 bg-slate-500/15 text-slate-700` |

Status-pill convention for tables/cards (customers, quotes, jobs, invoices,
assets, catalog): `rounded-full px-2(.5) py-1 text-[9px] font-bold`, tinted
with a matching `bg-{color}-50/100 text-{color}-700` pair chosen ad hoc per
status word (e.g. "Low stock" → orange, "In stock" → green, "Resolved" →
green, "Open" → amber) — there is no single central status-color map the
way KPI tones have one; each view picks its own two- or three-state ternary.
Standardize new statuses against the nearest existing one in the same view
before inventing a new color.

### Ported admin-parity modules (language B)
- **Canvas / card surface**: `bg-slate-950` (darkest), `bg-slate-900`
  (nested/input surface), `border-slate-800` hairlines. No tech-green
  anywhere in these four files.
- **Status/action accents**: amber (pending/warning/sync-retry), emerald
  (approve/success), rose (reject/void/offboard/delete), indigo (primary
  action buttons like "Add Contractor", "Sync to QuickBooks", "Retry
  Sync"), sky (informational, e.g. "Ready for QBO Sync").
- **Icons**: split even within this group — `ClientRequestsAdmin.tsx` uses
  lucide-react (`AlertTriangle`, `CalendarClock`, `RefreshCw`, `UserPlus`),
  while `ContractorRosterAdmin.tsx` and `SupportTicketsAdmin.tsx` use raw
  emoji (`🔗 ➕ 📅 🔌 🛠️ 🎉`) inline as text. If extending these modules,
  match whichever icon convention the specific file already uses rather
  than mixing both in one component.

## 3. Typography

Same three-family system as the parent brand (`font-display` = Montserrat,
`font-sans` = Inter, `font-mono` = JetBrains Mono), but the CRM's own usage
skews much smaller and denser than the marketing site's poster-scale type.

### Core CRM shell (language A)
- **Micro-type is the dominant register.** Body/label text runs
  `text-[8px]`–`text-[11px]` almost everywhere — table cells, form labels,
  badges, KPI subtext. `text-[9px]` and `text-[10px]` alone account for the
  large majority of all text-size declarations in `CRM.tsx`. This is a
  deliberate density choice for an operator tool, not an accessibility
  afterthought — labels compensate with `uppercase` + `font-bold` +
  `tracking-wide` rather than larger size.
- `font-display` is reserved for **numbers and short titles**, not
  paragraphs: KPI tile values (`font-display text-xl`/`text-2xl`), modal
  headings (`font-display text-lg uppercase`), dollar totals
  (`font-display text-xl`/`text-xxl`). Always uppercase when used as a
  heading, never for body copy.
- `font-mono` marks **anything that is an identifier**: work-order/quote/
  invoice numbers, audit-log entity IDs, the top-nav "Field Operations"
  eyebrow, audit-trail entity-type chips. Typically paired with
  `tech-green-deep` color and sits at `text-[8px]`–`text-[10px]`.
- Table headers: `bg-slate-50 text-[9px] uppercase text-slate-400` — this
  exact class combination is repeated verbatim across every data table in
  the app (Customers, Quotes, Jobs, Invoices, Catalog, Reports' overdue
  table). Treat it as the CRM's canonical `<thead>` style; don't invent a
  variant.
- Labels on light-surface form fields: `text-[9px] font-bold uppercase
  text-slate-500` (matches the parent doc's note on CRM modal labels).

### Ported admin-parity modules (language B)
- Denser still in places (`text-[9px]`/`text-[10px]` action buttons,
  `text-[10px]` uppercase section eyebrows: "PENDING TIMECARDS", "REGISTERED
  ASSETS"-style stat labels), but headings run slightly larger and use
  plain `font-bold text-sm`/`text-base` rather than `font-display` — these
  modules do not consistently pull in the Montserrat display face the way
  the core shell does. If unifying the two languages later, this is one of
  the concrete gaps to close.

## 4. Layout & Shell Structure

### App frame (applies everywhere in `/crm`)
- **Header**: sticky, `h-14`, `bg-[#101812]`, `border-b border-white/10`.
  Left: mobile nav toggle → logo mark (`bg-tech-green` square housing a
  `Gauge` icon) → "TechSavvy" wordmark (`font-display text-xs uppercase`)
  over a `tech-green` "Field Operations" eyebrow (`text-[9px]
  tracking-[.22em]`). Center: a global job search box (desktop only,
  `bg-white/[0.04]` translucent field). Right: Quick-create button, link
  back to the contractor admin dashboard, sign-out avatar chip
  (`bg-safety-orange`, initials "TT").
- **Sidebar**: `w-64`, white, `border-r border-slate-200`. Top: a full-width
  tech-green "Create new" button. Below: the module nav list — each item
  `rounded px-3 py-2.5 text-xs font-medium`, active state
  `bg-[#e8f7ed] text-tech-green-deep`, inactive `text-slate-600
  hover:bg-slate-50`, with an optional trailing count pill
  (`rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500`) for
  Jobs/Quotes/Invoices. Bottom: a small "Live operations sync" status line
  with a pulsing tech-green dot.
- **Content header** (per-module, inside `<main>`): breadcrumb
  (`Field Operations › {current module}`, current segment in
  `tech-green-deep`) above an `font-display text-xl uppercase` page title,
  with Export/Add-record buttons at the right.
- **Mobile**: sidebar becomes a `fixed inset-y-14 left-0` overlay panel
  toggled by the header's menu button; no separate mobile nav pattern
  beyond that.

### Cards & panels (language A)
- `rounded border border-slate-200 bg-white shadow-sm` — the near-universal
  card shell for every section, table wrapper, and KPI tile. Corners are
  intentionally subtle (`rounded`, ~4px), matching the parent brand's "never
  pill-shaped, barely rounded" button rule extended to cards here.
- KPI tile anatomy: label (`text-[9-10px] uppercase text-slate-400`) +
  small tone-colored icon chip, top row; big `font-display` value, bottom
  row; optional muted subtext/comparison figure.

### Cards & panels (language B)
- `rounded-xl` or `rounded-2xl border border-slate-800 bg-slate-950` (or
  `bg-slate-900` for a nested/lighter tier) — noticeably more rounded and
  darker than language A's cards. Stat tiles in this language use plain
  `text-2xl font-bold` values with no `font-display` face and a colored
  (amber/emerald/blue/red) number rather than a neutral one with a colored
  icon chip.

### Modals
- **Language A**: centered, `fixed inset-0 z-50 grid place-items-center
  bg-black/60`, panel is `rounded bg-white p-6 shadow-2xl` — a plain white
  card matching the parent doc's note that CRM modals flip the marketing
  site's dark-glass language to a light surface entirely.
- **Language B**: centered, `fixed inset-0 z-50 ... bg-slate-950/80
  backdrop-blur-sm`, panel is `rounded-2xl border-slate-800
  bg-slate-900/90 ... backdrop-blur-md p-6 shadow-2xl` — i.e. it keeps the
  marketing site's dark-glass/backdrop-blur treatment that language A
  drops. This is the clearest single tell for which "half" of the CRM a
  screen belongs to.

## 5. Components

### Buttons
- Primary (language A): `bg-tech-green text-brand-black`, or the darker
  `bg-[#17251b] text-white` variant for secondary-primary actions
  (exports, "Add X" buttons scattered through data views) — both
  `font-bold`, small `text-[10-11px]`, `uppercase tracking-wider` when used
  as a top-level action, sentence-case when it's a compact table-row action.
- Secondary (language A): `rounded border border-slate-200
  px-3 py-2 text-[10px] font-semibold text-slate-600` — plain outline,
  no fill.
- Destructive (language A): red text on a light/no fill
  (`border-red-200 text-red-600`), never a solid red button.
- Language B buttons trade the tech-green/dark-green system for
  color-coded outline pills: `border-{color}-500/30 text-{color}-300
  hover:bg-{color}-500 hover:text-slate-950`, where color maps to the same
  amber/emerald/rose/indigo/sky roles as the badges above.

### Tables
- Canonical shape (language A): `overflow-x-auto` wrapper →
  `<table className="w-full min-w-[Npx] text-left">` → `<thead
  className="bg-slate-50 text-[9px] uppercase text-slate-400">` →
  `<tbody className="divide-y divide-slate-100">`, row hover
  `hover:bg-slate-50`. Cell padding is `px-3 py-2/3` or `px-4 py-3`
  depending on density; numeric/currency columns right-align.
- Language B tables (Contractor Roster) use the same `<thead
  bg-slate-950 text-slate-400 uppercase text-[10px] font-bold
  border-b border-slate-800>` shape, just recolored dark and with a
  heavier header weight.

### Icons
- Language A: lucide-react exclusively, `h-3.5 w-3.5`–`h-5 w-5`, always
  paired with a small colored chip/circle background for emphasis (KPI
  icons, sidebar module icons).
- Language B: mixed lucide-react / raw emoji depending on file (see §2).

## 6. Notes for Future Stitch Generation / New CRM Screens

### Default to language A unless told otherwise
Prompting for a brand-new CRM screen with no further context should
produce: light `#F3F5F4` canvas, white `rounded border-slate-200
shadow-sm` cards, `text-[9-10px]` uppercase micro-labels, `font-display`
reserved for numbers/titles, tech-green-deep for active/link states,
tech-green (bright) reserved for the one primary CTA per view, and status
pills drawn from the shared `tones` semantic palette rather than inventing
new hex values.

### Known drift to flag, not silently "fix"
- The amber/emerald/rose/indigo palette in Contractor Roster, Timecard
  Approval, Support Tickets, and Client Requests never touches tech-green
  or safety-orange — these four screens are visually a different product
  today. Don't casually restyle one in isolation; if unifying them with
  language A, treat it as a deliberate design pass across all four
  together, not a per-ticket fix.
- Emoji-as-icon (`🛠️ 🔗 📅 ➕ 🔌 🎉`) in `ContractorRosterAdmin.tsx` and
  `SupportTicketsAdmin.tsx` is inconsistent with lucide-react everywhere
  else in the CRM, including the other two dark-theme files. Prefer
  lucide-react for any new icon in these files rather than adding more
  emoji.
- Three distinct "brand greens" are in concurrent use in language A alone
  (`tech-green` #22C55E, `tech-green-deep` #15803D, and the unnamed
  `#17251b` button fill). This works today because each has a fairly
  consistent role (bright CTA / active-state text / secondary-primary
  button), but a new component should pick from these three roles
  deliberately rather than introducing a fourth green.
- No dedicated destructive/error token, same gap the parent doc already
  flags for the marketing site — the CRM borrows plain Tailwind
  `red-500`/`red-600`/`rose-*` ad hoc.

### Component prompts
- "A light admin data table: white card, `rounded border-slate-200
  shadow-sm`, `bg-slate-50` header row with `text-[9px] uppercase
  text-slate-400` column labels, hairline row dividers, a tech-green-deep
  mono reference number in the first column, a status pill on the right
  using a semantic tint (green/amber/red/slate) matched to the row's
  state."
- "A CRM KPI tile row: four white cards in a grid, each with a small
  tone-tinted icon chip top-right, an uppercase `text-[9px]` label, a big
  `font-display` value, and a muted one-line comparison figure beneath."
- "A CRM light-theme modal: centered on a `bg-black/60` overlay, plain
  white `rounded` card, `font-display text-lg uppercase` title, form
  fields with `text-[9px] font-bold uppercase text-slate-500` labels, a
  tech-green primary button and a plain-outline cancel button."
