---
name: TechSavvy LLC
colors:
  brand-black: "#0B0F0C"
  brand-slate: "#151916"
  tech-green: "#22C55E"
  tech-green-deep: "#15803D"
  safety-orange: "#FF8C00"
  brand-white: "#F9FAFB"
---

# Design System: TechSavvy LLC
**Project ID:** techsavvytechs.com / contractor & CRM portal

## 1. Visual Theme & Atmosphere

TechSavvy reads as an industrial-modern field-services brand: a near-black
canvas (`#0B0F0C`), hairline white borders at 5-10% opacity, and a single
electric accent — safety-vest green (`#22C55E`) — doing almost all of the
signaling work (links, primary CTAs, active states, glow effects). A second
accent, safety orange (`#FF8C00`), is used sparingly for emphasis words and
secondary callouts ("Ends Here.", featured badges), evoking hazard-tape
urgency without competing with the green. The overall mood is "blueprint
meets command center" — dark glass panels, blurred glow orbs, monospace
micro-labels in wide tracking that read like equipment nameplates or telemetry
readouts.

Density is low-to-moderate: hero sections are spacious with huge uppercase
display type, while data-dense contractor/CRM screens tighten up but keep the
same dark-surface-plus-green-accent language. Nothing is skeuomorphic or soft;
corners are barely rounded (`rounded-sm`), shadows are used for glow rather
than elevation, and glass/blur surfaces stand in for card borders.

## 2. Color Palette & Roles

### Primary Foundation
- **Brand Black** `#0B0F0C` — root background, header bands, deepest surface.
- **Brand Slate** `#151916` — glass-card surface tone (`bg-brand-slate/40` with
  backdrop-blur), secondary panel background.

### Accent & Interactive
- **Tech Green** `#22C55E` — the brand's single most important color: primary
  buttons, links, active nav states, logo wordmark ("Savvy"), glow shadows
  (`glow-green`, `rgba(34,197,94,0.3)`).
- **Tech Green Deep** `#15803D` — darker green for hover/pressed states and
  deep-accent text on light surfaces (used as `text-tech-green-deep` on white
  modal backgrounds, e.g. CRM modals).
- **Safety Orange** `#FF8C00` — secondary accent for emphasis, warnings, and
  "featured" markers; has its own glow (`glow-orange`,
  `rgba(255,140,0,0.4)`) and glass variant (`glass-orange`).

### Typography & Text Hierarchy
- **Brand White** `#F9FAFB` — primary text on dark surfaces, headings.
- **Slate 400/500/600** (Tailwind slate scale) — secondary/muted text,
  timestamps, captions, disabled states.
- On light surfaces (CRM modals, which flip to a white card on dark overlay),
  body text uses near-black `#17251b`-family tones with `text-slate-500` for
  labels.

### Functional States
- Success / accepted: tech-green.
- Warning / pending / featured: safety-orange.
- No dedicated red/error token found in the theme — destructive actions
  (delete buttons) use plain Tailwind `text-red-500`, which is an
  off-system borrow worth formalizing.

## 3. Typography Rules

**Families** (Google Fonts, loaded via `@import` in `src/index.css`):
- `--font-display`: **Montserrat** (700/800) — big, extrabold, uppercase,
  tight/tighter tracking. Used for all headings, hero type, and the
  "TechSavvy" wordmark. Geometric, confident, poster-like.
- `--font-sans`: **Inter** (300-600) — body copy, UI labels, form fields.
  Clean and neutral, gets out of the way.
- `--font-mono`: **JetBrains Mono** (400/500) — micro-labels, eyebrow tags,
  telemetry-style captions, quote/work-order numbers. Always uppercase, always
  wide-tracked (`tracking-[0.2em]` to `tracking-[0.4em]`), almost always tiny
  (8-10px). This is the brand's signature typographic tic.

### Hierarchy & Weights
- H1 (hero): `font-display font-extrabold text-7xl md:text-8xl uppercase
  tracking-tighter leading-[0.85]`
- H2 (section): `font-display font-extrabold text-5xl md:text-6xl uppercase
  tracking-tighter leading-none`
- H3 (card/feature title): `font-display font-bold text-xl md:text-2xl
  uppercase tracking-tight`
- Eyebrow/kicker (above headings): `font-mono text-[10px] uppercase
  tracking-[0.4em] font-bold`, usually tech-green or safety-orange
- Body: `font-sans` at `text-sm`/`text-base`, relaxed line-height
- Nav / button labels: `font-bold uppercase tracking-widest text-xs`

### Spacing Principles
- Headings use negative tracking (`tracking-tighter`/`tracking-tight`) for
  density and punch.
- Micro-labels use extreme positive tracking (`0.2em`-`0.4em`) — this
  contrast (tight display type vs. ultra-wide mono labels) is a core brand
  signature; both should appear together in any TechSavvy-branded surface.

## 4. Component Stylings

### Buttons
- Shape: `rounded-sm` (barely rounded, almost square) — never pill-shaped.
- Label: always `font-bold uppercase tracking-widest`.
- Primary (`variant="primary"`): `bg-tech-green text-brand-black`, plus
  `glow-green` box-shadow (`0 0 20px rgba(34,197,94,0.3)`), scales up 1.02x
  on hover.
- Secondary: transparent with `border-brand-slate`, hover border flips to
  tech-green.
- Glass: translucent gradient (`glass-button`) with hairline white border,
  brightens on hover.
- Orange variant mirrors primary but with safety-orange + `glow-orange`.
- Sizes: sm `px-4 py-2 text-[10px]`, md `px-6 py-3 text-xs`, lg `px-8 py-4
  text-sm`.

### Cards & Glass Panels
- `.glass-card`: `bg-brand-slate/40 backdrop-blur-md border border-white/5`,
  `rounded-sm`.
- Hover states brighten the border to `tech-green/40` rather than adding
  elevation/shadow.
- Blurred color "glow orbs" (`bg-tech-green/5 rounded-full blur-[120px]`)
  are a recurring background decoration behind hero/section content —
  never sharp-edged color blocks.

### Navigation
- Dark, glass dropdown panels; nav item labels are `text-[13px] font-bold
  uppercase tracking-widest`, hover shifts text to tech-green.

### Inputs & Forms (CRM/portal context)
- On dark surfaces: hairline `border-white/10-ish`, focus state brightens
  border.
- On the CRM's light modal surfaces: `rounded border border-slate-200`,
  labels are `text-[9px] font-bold uppercase text-slate-500` — same
  eyebrow-label logic as the marketing site, just recolored for a white
  background.

### Logo / Wordmark
- Icon: an interlocking "T/S" monogram drawn as a single continuous rounded
  stroke (not filled blocks) — green crossbar/stem for the "T", white for
  the S-curve body, with a short green diagonal foot at the base. Stroke
  weight is heavy relative to the glyph size, rounded caps/joins throughout
  (see `src/components/Logo.tsx`, corrected 2026-09-08 against the official
  reference mark).
- Wordmark: "Tech" in brand-white + "Savvy" in tech-green, set in
  `font-display font-bold tracking-tighter` — the two-tone split is
  brand-specific and should be preserved anywhere the name appears in text,
  not just the icon.
- Below the wordmark: a centered `LLC` in mono, `tracking-[0.4em]
  uppercase`, flanked by thin green rule lines (`h-[1px] bg-tech-green/50`)
  — this is the brand's standard sub-lockup, currently absent from every
  transactional email.

### Domain-Specific: Transactional / Customer Emails (current state)
The existing quote/invoice/portal emails (`api/contact.js`) use a **generic
inline-HTML template** that only partially matches the brand:
- ✅ Correct header background (`#0b0f0c`) and correct green (`#22c55e`).
- ❌ Wordmark is plain text `TECHSAVVY` (single color, no Tech/Savvy split,
  no icon glyph).
- ❌ Font is `Arial, sans-serif` — no Montserrat/Inter/JetBrains Mono at all,
  so none of the brand's typographic signature (tight display headings +
  ultra-wide-tracked mono labels) survives into email.
- ❌ No safety-orange accent anywhere.
- ❌ Buttons are `border-radius:5px` (brand uses `rounded-sm`, i.e. ~2px) and
  plain-cased ("Review and approve quote") instead of the brand's uppercase
  tracked-widest button label style.
- ❌ No mono eyebrow label, no LLC sub-lockup, no glass/hairline-border
  panel styling — the body is a flat white card with a plain gray border,
  which reads more like a generic SaaS transactional email than TechSavvy.

## 5. Layout Principles

### Grid & Structure
- Marketing pages: single-column centered content, `max-width` container
  patterns typical of Tailwind (implicit via padding, no explicit custom
  breakpoint system found beyond Tailwind defaults).
- Emails: currently constrained to `max-width:620px` — reasonable and can
  stay as-is for a brand-matched redesign (email clients need inline
  styles + table-safe layout, not Tailwind).

### Whitespace Strategy
- Generous section padding on the marketing site (large hero paddings,
  `mb-10`, `p-8`+ on major blocks).
- CRM/portal density is tighter (compact modals, `p-6`, `gap-2`/`gap-3`)
  but still gives labels room via uppercase micro-type rather than font
  size.

### Alignment & Visual Balance
- Hero/section headers: left-aligned, huge type, glow orbs offset to one
  side for asymmetry.
- CRM modals/forms: label-above-field, left-aligned, two-column grids for
  paired fields.

### Responsive Behavior & Touch
- Contractor dashboard enforces `min-height:44px` touch targets and
  `touch-action:manipulation` on interactive elements below 640px — a real
  accessibility/usability constraint worth carrying into any customer-facing
  mobile email CTA (button tap target should be generous).

## 6. Design System Notes for Stitch Generation

### Language to Use
"Industrial-modern field-services", "blueprint command-center", "dark glass
panel with a single hazard-green accent", "telemetry-style micro-labels",
"poster-weight uppercase display type", "hairline white borders, never hard
shadows".

### Color References
- Brand Black `#0B0F0C` — canvas / header band
- Brand Slate `#151916` — glass panel surface
- Tech Green `#22C55E` — primary accent, CTAs, wordmark half, glow
- Tech Green Deep `#15803D` — hover/pressed, deep-accent-on-light-surface text
- Safety Orange `#FF8C00` — secondary accent, urgency/featured markers
- Brand White `#F9FAFB` — primary text on dark backgrounds

### Component Prompts
- "A dark (#0B0F0C) transactional email header with the TechSavvy T/S glyph
  icon, the wordmark split Tech (white) / Savvy (tech-green) in bold
  Montserrat, and a thin green-ruled 'LLC' mono sub-lockup beneath it."
- "A quote-approval email body on a near-black glass panel
  (bg-brand-slate/40, hairline white border, rounded-sm) with a JetBrains
  Mono uppercase wide-tracked eyebrow label ('QUOTE PENDING APPROVAL'), a
  Montserrat extrabold quote number and dollar total, and a tech-green
  `rounded-sm` CTA button with uppercase tracked-widest label."
- "A safety-orange mono micro-label used sparingly for the expiration
  notice, echoing the marketing site's 'Featured briefing' treatment."

### Incremental Iteration
- Keep the email's outer wrapper light/neutral for email-client
  compatibility (dark-mode email rendering is inconsistent), but bring the
  header band, button, typography choices, and mono eyebrow labels in line
  with the live site before shipping.
- Preserve the existing `escapeHtml()` usage around all interpolated values
  (customer name, quote number, totals, links) — the redesign should only
  touch static markup/CSS, not the data-escaping logic in `api/contact.js`.
