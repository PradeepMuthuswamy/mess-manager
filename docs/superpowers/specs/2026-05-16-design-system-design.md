# Officers Mess — Design System Overhaul

**Date:** 2026-05-16
**Status:** APPROVED — user-reviewed · skill-validated · radius 0.375rem · full-scope (every page, user override) · ready for planning
**Direction:** Modern Defence SaaS · cool slate neutrals + indigo primary · Space Grotesk headings
**Skill validation:** Token system audited by `ui-ux-pro-max` (color/a11y), `impeccable` (system/UX), `design-taste-frontend` (type/spacing/radius), `high-end-visual-design` (elevation), `emil-design-eng` (motion). Their concrete corrections are folded below.

## Problem

Every color token in `app/globals.css` is `oklch(L 0 0)` — zero chroma, pure grayscale, raw shadcn default. No brand color, no accent, no semantic state colors, no elevation (zero shadow tokens), no chart palette (5 grays), one font for everything. The app reads flat and monotonous despite a clean component baseline.

## Goal

Replace the token foundation with a calibrated, professional, WCAG-AA-checked design system delivered **entirely through semantic tokens** (no hardcoded colors/fonts downstream), then polish pages against it. Light-first, both themes fully calibrated.

## Non-goals

- No new product features/routes. The design-system reference is a static in-repo doc page, not a new authd product surface.
- No auth/admin/data-layer changes; visual-only page edits.
- No renaming `--font-sans` / `--font-geist-mono`.
- No "fixing" the `components/ui/*` shadcn baseline beyond token-driven changes.

## Constraints (hard — enforced by review)

- Semantic tokens only. Banned: raw palette classes, arbitrary color values, inline color/font styles, custom font-family. (Per `AGENTS.md`.)
- Audit gate per touched file: `grep -rnE "text-(gray|red|green|blue|emerald|slate|zinc|neutral|stone)-[0-9]|bg-(gray|red|green|blue|emerald|slate|zinc|neutral|stone)-[0-9]|#[0-9a-fA-F]{3,6}|\[oklch|\[rgb|style=\{\{[^}]*(color|background|fontFamily)" app components` → no new hits.
- `npm run lint` + `npm run build` pass after Phase 1 and at end.
- AGENTS.md auth-contract grep unchanged (proves no gate touched).
- `grep` is necessary-not-sufficient: it proves token compliance, **not** visual coherence. The human visual gate (light+dark screenshots) is the real bar.

## Token Design

### Color — Light (`:root`) — AA-corrected per ui-ux-pro-max

| Token | Value |
|---|---|
| `--background` | `oklch(0.99 0.004 255)` |
| `--foreground` | `oklch(0.24 0.02 262)` |
| `--card` / `--popover` | `oklch(1 0 0)` |
| `--card-foreground` / `--popover-foreground` | `oklch(0.24 0.02 262)` |
| `--primary` | `oklch(0.52 0.18 264)` |
| `--primary-foreground` | `oklch(0.99 0.003 255)` |
| `--secondary` / `--muted` | `oklch(0.968 0.006 255)` |
| `--secondary-foreground` | `oklch(0.28 0.02 262)` |
| `--muted-foreground` | `oklch(0.45 0.02 262)` *(was 0.51 — AA fail on bg)* |
| `--accent` | `oklch(0.95 0.035 264)` |
| `--accent-foreground` | `oklch(0.34 0.13 264)` *(was 0.38/0.12)* |
| `--destructive` | `oklch(0.58 0.22 27)` |
| `--success` | `oklch(0.55 0.16 155)` *(was 0.62/0.15 — AA)* |
| `--warning` | `oklch(0.60 0.14 75)` *(was 0.72/0.15 — AA fail)* |
| `--info` | `oklch(0.52 0.15 240)` *(was 0.60/0.14 — AA)* |
| `--border` / `--input` | `oklch(0.92 0.007 255)` |
| `--ring` | `oklch(0.52 0.18 264)` |
| `--chart-1..5` | `0.52 0.18 264` · `0.58 0.13 185` · `0.66 0.15 75` · `0.60 0.16 8` · `0.55 0.17 300` *(chart-2/3 reweighted)* |
| `--sidebar` | `oklch(0.985 0.005 255)` |
| `--sidebar-foreground` | `oklch(0.30 0.02 262)` |
| `--sidebar-primary` | `oklch(0.52 0.18 264)` |
| `--sidebar-primary-foreground` | `oklch(0.99 0.003 255)` |
| `--sidebar-accent` | `oklch(0.95 0.035 264)` |
| `--sidebar-accent-foreground` | `oklch(0.32 0.13 264)` *(chroma 0.10→0.13)* |
| `--sidebar-border` | `oklch(0.92 0.007 255)` |
| `--sidebar-ring` | `oklch(0.52 0.18 264)` |
| `--radius` | `0.375rem` (6px — tighter instrument-panel feel; cascades through all `--radius-*`) |

State tokens (`--success/--warning/--info` + `-foreground` companions) are **new**; wire each into `@theme inline` (`--color-success: var(--success)` …) so `bg-success` / `text-success` exist.

### Color — Dark (`.dark`) — parity-corrected

| Token | Value |
|---|---|
| `--background` | `oklch(0.17 0.015 262)` |
| `--foreground` | `oklch(0.96 0.004 255)` |
| `--card` / `--popover` | `oklch(0.21 0.018 262)` |
| `--card-foreground` / `--popover-foreground` | `oklch(0.96 0.004 255)` |
| `--primary` | `oklch(0.64 0.17 264)` |
| `--primary-foreground` | `oklch(0.17 0.015 262)` |
| `--secondary` / `--muted` | `oklch(0.26 0.02 262)` |
| `--secondary-foreground` | `oklch(0.96 0.004 255)` |
| `--muted-foreground` | `oklch(0.70 0.02 262)` |
| `--accent` | `oklch(0.30 0.05 264)` |
| `--accent-foreground` | `oklch(0.92 0.02 264)` |
| `--destructive` | `oklch(0.66 0.20 25)` |
| `--success` | `oklch(0.74 0.15 155)` *(parity lift)* |
| `--warning` | `oklch(0.80 0.16 75)` *(parity lift)* |
| `--info` | `oklch(0.68 0.13 240)` |
| `--border` | `oklch(1 0 0 / 14%)` *(was 9% — invisible dividers)* |
| `--input` | `oklch(1 0 0 / 14%)` |
| `--ring` | `oklch(0.64 0.17 264)` |
| `--chart-1..5` | `0.64 0.17 264` · `0.70 0.11 185` · `0.72 0.15 75` · `0.68 0.16 8` · `0.66 0.16 300` *(chart-3 reweighted)* |
| sidebar.* | dark-tuned analogues (same hues, dark surface/text) |

### Typography (per design-taste-frontend)

- `layout.tsx`: add `Space_Grotesk` (`next/font/google`, weights 500/600/700, `variable: "--font-heading"`), attach `.variable` to `<html>` alongside Geist vars.
- `globals.css` `@theme inline`: `--font-heading: var(--font-heading)` (was `var(--font-sans)`).

**Type scale (1.200 minor-third, dense-ops profile):**

| Role | Font | rem/px | Line-height | Weight | Tracking |
|---|---|---|---|---|---|
| h1 display | Space Grotesk | 1.875 / 30 | 1.2 | 700 | `-0.02em` |
| h2 section | Space Grotesk | 1.5 / 24 | 1.25 | 600 | `-0.015em` |
| h3 card/group | Space Grotesk | 1.25 / 20 | 1.3 | 600 | `-0.01em` |
| h4 sub | Space Grotesk | 1.0625 / 17 | 1.4 | 600 | `-0.005em` |
| Body | Geist | 0.875 / 14 | 1.57 | 400 | `0` |
| Body-lg (marketing/auth) | Geist | 1.0 / 16 | 1.6 | 400 | `0` |
| Small/helper | Geist | 0.8125 / 13 | 1.4 | 400 | `0` |
| Label/overline | Geist | 0.75 / 12 | 1.33 | 500–600, uppercase | `+0.04em` |
| Mono/numeric | Geist Mono | inherit | match row | 500 | `0`, `tabular-nums` |

Tracking is **size-dependent** (blanket `-0.02em` was wrong — mushes small headings). 14px body is intentional for dense tables; never < 13px in cells. Hierarchy via weight/color, not oversized H1.

### Spacing (4px base — Phase-2 agents must snap to this)

Allowed steps only: `0.5,1,1.5,2,3,4,6,8,12,16` (= 2/4/6/8/12/16/24/32/48/64px). No `p-5`, no arbitrary `gap-[14px]`. Field gap `gap-2`; form rhythm `space-y-4`; card padding `p-4` dense / `p-6` standard; section gap `space-y-6`; page container `px-6 py-6 max-w-7xl mx-auto`; table cell `px-3 py-2`.

### Numeric / tabular rule

`tabular-nums` mandatory on every money/quantity/ID/rate/count/date. Financial & quantity values → `font-mono tabular-nums`, right-aligned, fixed 2-decimal currency. Negative/credit → `text-destructive`; positive delta → `text-success`. Token-only, never raw red/green.

### Elevation (per high-end-visual-design — new; app had none)

Wire `--shadow-xs..xl` into `@theme inline`, referencing per-theme custom props so they flip with theme.

**Light** (tinted `oklch(0.24 0.02 262)`, α 0.05→0.18, layered):
- `--shadow-xs`: `0 1px 2px 0 oklch(0.24 0.02 262 / 0.05)`
- `--shadow-sm`: `0 1px 2px -1px oklch(0.24 0.02 262 / 0.07), 0 1px 3px 0 oklch(0.24 0.02 262 / 0.06)`
- `--shadow-md`: `0 2px 4px -2px oklch(0.24 0.02 262 / 0.08), 0 4px 10px -2px oklch(0.24 0.02 262 / 0.10)`
- `--shadow-lg`: `0 4px 8px -3px oklch(0.24 0.02 262 / 0.10), 0 12px 24px -6px oklch(0.24 0.02 262 / 0.13)`
- `--shadow-xl`: `0 8px 16px -6px oklch(0.24 0.02 262 / 0.12), 0 24px 48px -12px oklch(0.24 0.02 262 / 0.18)`

**Dark** (near-black, α 0.30→0.55, deeper):
- `--shadow-xs`: `0 1px 2px 0 oklch(0.10 0.015 262 / 0.30)`
- `--shadow-sm`: `0 1px 2px -1px oklch(0.10 0.015 262 / 0.34), 0 1px 3px 0 oklch(0.08 0.012 262 / 0.32)`
- `--shadow-md`: `0 2px 5px -2px oklch(0.08 0.012 262 / 0.40), 0 6px 14px -3px oklch(0.06 0.01 262 / 0.42)`
- `--shadow-lg`: `0 6px 12px -4px oklch(0.06 0.01 262 / 0.46), 0 16px 32px -8px oklch(0.04 0.008 262 / 0.50)`
- `--shadow-xl`: `0 10px 22px -6px oklch(0.05 0.01 262 / 0.50), 0 32px 60px -14px oklch(0.03 0.006 262 / 0.55)`
- `--hairline-inset` (dark only): `inset 0 1px 0 0 oklch(1 0 0 / 0.06)` — appended to popover/dialog/card stacks for a machined top edge.

**Elevation policy (impeccable):** shadows signal interaction/overlay only. Resting content is **border-led in light, shadow-led in dark**. Mapping:

| Surface | Light | Dark |
|---|---|---|
| Card rest | `shadow-xs` + border | `shadow-sm` + border |
| Card hover (interactive) | `shadow-md` + lift | `shadow-md` + lift |
| Sidebar | flat + `border-r` | flat + hairline |
| Dropdown/Popover/Select | `shadow-lg` + border | `shadow-lg` + hairline |
| Dialog/Sheet | `shadow-xl` + border | `shadow-xl` + inset hairline |
| Toast | `shadow-lg` | `shadow-lg` + hairline |

**Premium touch:** `.lift` utility — on interactive card/button hover, step shadow up + `translateY(-1px)` over `var(--duration-base) var(--ease-out)`. Token-only.

### Motion (per emil-design-eng)

Tokens: `--ease-out: cubic-bezier(0.16,1,0.3,1)` · `--ease-standard: cubic-bezier(0.4,0,0.2,1)` · `--ease-exit: cubic-bezier(0.4,0,1,1)` *(new)* · `--duration-fast: 120ms` · `--duration-base: 200ms` · `--duration-slow: 320ms` · `--duration-instant: 0ms` *(new)*.

Interaction map:

| Element | State | Animate | Token |
|---|---|---|---|
| Button/link | hover | bg, color, shadow | fast · ease-out |
| Button | press | `scale(0.97)` | fast · ease-out |
| Button/input/card | focus-visible | ring, border | fast · ease-out |
| Input | hover/focus | border, shadow | fast · ease-out |
| Card (interactive) | hover | shadow, border | base · ease-out |
| Sidebar | expand/collapse | `width` only | base · ease-standard |
| Dialog | enter / exit | opacity, `scale(0.96→1)` / `scale(0.98)` | slow·ease-out / base·ease-exit |
| Popover/dropdown | enter / exit | opacity, `scale(0.97→1)` | base·ease-out / fast·ease-exit |
| Tooltip | enter | opacity, scale | fast · ease-out |
| Toast | enter/exit | translateY, opacity | base · ease-out/exit |

Press = `scale` only, never translate. Use explicit `transition: transform, background-color, color, box-shadow` — **never `transition: all`**. `--duration-slow` is dialog/drawer-enter only.

**Reduced-motion** (`prefers-reduced-motion: reduce`): transform/position → `--duration-instant`; keep opacity/color at ~120ms; drop press-scale and dialog/popover scale (keep fade); sidebar collapses instantly.

**Do NOT animate:** content width/height/margin/padding (sidebar `width` is the sole exception), `transition: all`, table rows/list re-renders/pagination/tab-panel swaps, keyboard-driven toggles, numeric/money cells, `box-shadow` slower than fast, focus ring (must be immediate for a11y).

### Shared state primitives & a11y (per impeccable — Phase 1 deliverable)

Built **once** in Phase 1, consumed (not re-authored) by Phase 2: `EmptyState`, skeleton row, error/retry block, inline form error. Plus first-class, documented recipes for **focus-visible** (2px `--ring` + offset) and **disabled** (opacity + `cursor-not-allowed`, no transition) so keyboard/disabled affordances are identical everywhere.

### Data tables (per impeccable — the product's core surface)

Mess ledgers / ration scales / billing / audit are dense tables. Canonical pattern: compact row density default, right-aligned `font-mono tabular-nums` numerics, sticky header, border-separated (not zebra), explicit sort/filter affordances, defined stance for >1000 rows (pagination). This is specified centrally, not improvised per agent.

## Execution — phased, multi-agent

### Phase 1 — Foundation (sequential)
1. Rewrite `app/globals.css` token blocks (color light/dark, `@theme inline` additions: state colors, `--shadow-*`, motion vars, `--font-heading`, `--hairline-inset`).
2. `app/layout.tsx`: add Space Grotesk.
3. Base layer: type scale + size-dependent tracking, focus-visible, disabled, reduced-motion, motion transitions on primitives.
4. Build the 4 shared state primitives + `.lift` utility.
5. Wire token additions into shadcn button/card/input/table/badge/tabs/dialog/popover/sidebar/toast where shadow/motion/state needs binding — no structural rewrites.
6. **Gate:** `npm run lint` + `npm run build` green; light+dark visual smoke of dashboard. Commit before any fan-out.

### Phase 2 — Page polish (parallel agents, ≤5 concurrent waves)
Each agent: re-reads `AGENTS.md` + this spec, invokes design skills as needed (`ui-ux-pro-max`, `impeccable`, `design-taste-frontend`, `high-end-visual-design`, `emil-design-eng`), applies spacing/hierarchy/state/density polish using **only** semantic tokens + the shared primitives, runs the audit grep on touched files, leaves auth/data untouched, and **attaches light+dark screenshots of one populated + one empty screen** to its summary for the review gate. Dashboard agent is **explicitly forbidden** the hero-metric / identical-stat-card-grid template — lead with the operational table.

**Route scope (decided — EVERYTHING, user override of impeccable's narrowing):** hand-polish **every** route group, no page unturned: `(marketing)`, `(auth)`, `dashboard`, `settings`, all ops routes (`messing/attendance/ration/bar/party/guest-rooms/billing`), and all admin routes (`admin` home + `users/units/masters/capabilities/audit`, masters has 5 children). Placeholder stubs get polished as polished placeholders (consistent empty-state treatment), accepted as redone-later when each module ships. **20–30 agents total**, dispatched in waves of ≤6 concurrent for tractable review.

### Phase 3 — Consistency sweep + docs
- Cross-page consistency pass (rhythm, scale, shadow usage, state colors).
- Static design-system reference (token table, type scale, elevation, states) as an in-repo doc/Storybook-style page — **not** a new authd route.
- Final lint + build + full audit grep + AGENTS.md auth-contract grep.

## Risks & Mitigations

- **Token drift across agents** → spec is single source of truth; shared primitives; audit grep + per-wave screenshot review.
- **Contrast regressions** → palette AA-corrected by ui-ux-pro-max; light/dark parity lifts; reference page enables visual check.
- **Scope creep into structure/logic** → agents visual/token only; AGENTS.md auth grep unchanged.
- **Shadow-as-decoration** → elevation policy: shadows = interaction/overlay only.
- **Dashboard stat-card cliché** → explicit anti-pattern ban for that agent.
- **Build breakage from font** → Phase 1 gate before fan-out.

## Success Criteria

- `globals.css` carries full AA-checked token set (color/elevation/motion/type) for both themes; no zero-chroma grays.
- Space Grotesk headings via `--font-heading`; Geist body/mono unchanged.
- Shared state primitives + focus/disabled recipes exist and are reused.
- In-scope route groups polished, semantic-token-only (grep clean) + visual gate passed (screenshots).
- `npm run lint` + `npm run build` pass; AGENTS.md auth grep unchanged.
- Static design-system reference documents the system.
