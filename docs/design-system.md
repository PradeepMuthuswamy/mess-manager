# Officers Mess — Design System Reference

**Direction:** Modern Defence SaaS — cool slate neutrals, indigo primary, calm and high-trust.
**Source of truth:** `app/globals.css`. Never hardcode colors/fonts; use the semantic tokens below. Enforced by `scripts/ds-audit.sh`.

## Fonts

| Role | Family | Token / class |
|---|---|---|
| Body / UI | Geist | `font-sans` (`--font-sans`) |
| Headings (h1–h4) | Space Grotesk | applied automatically via base layer (`--font-heading`) |
| Numbers / IDs / money | Geist Mono | `font-mono` + `.tabular` (`--font-geist-mono`) |

Do not rename `--font-sans` or `--font-geist-mono`.

## Type scale (dense-ops, 1.200)

| Role | Size | Line-height | Weight | Tracking |
|---|---|---|---|---|
| h1 display | `text-3xl` (30px) | 1.2 | 700 | −0.02em |
| h2 section | `text-2xl` (24px) | 1.25 | 600 | −0.015em |
| h3 card/group | `text-xl` (20px) | 1.3 | 600 | −0.01em |
| h4 sub | ~17px | 1.4 | 600 | −0.005em |
| Body | `text-sm` (14px) | 1.57 | 400 | 0 |
| Body-lg (marketing/auth) | `text-base` (16px) | 1.6 | 400 | 0 |
| Small / helper | 13px | 1.4 | 400 | 0 |
| Label / overline | `text-xs` (12px) | — | 500–600, uppercase | +0.04em |
| Mono / numeric | inherit | — | 500 | 0, `tabular-nums` |

Page titles: `text-3xl font-bold`. Hierarchy comes from weight/color, not oversized headings. Table cell text never below 13px.

## Color tokens (OKLCH)

Use semantic classes only: `bg-background`, `text-foreground`, `bg-card`, `bg-muted`, `text-muted-foreground`, `bg-primary`, `text-primary`, `bg-accent`, `bg-destructive`, `bg-success`, `bg-warning`, `bg-info`, `border-border`, `ring-ring`, `bg-popover`, `bg-sidebar`, `bg-chart-1..5`. Opacity modifiers (`bg-primary/10`) are fine.

### Light (`:root`)

| Token | Value | Use |
|---|---|---|
| `--background` | `oklch(0.99 0.004 255)` | app canvas |
| `--foreground` | `oklch(0.24 0.02 262)` | primary text |
| `--card` / `--popover` | `oklch(1 0 0)` | raised surfaces |
| `--primary` | `oklch(0.52 0.18 264)` | brand / primary action |
| `--primary-foreground` | `oklch(0.99 0.003 255)` | text on primary |
| `--secondary` / `--muted` | `oklch(0.968 0.006 255)` | quiet surfaces |
| `--muted-foreground` | `oklch(0.45 0.02 262)` | secondary text (AA) |
| `--accent` | `oklch(0.95 0.035 264)` | indigo tint surface |
| `--accent-foreground` | `oklch(0.34 0.13 264)` | text on accent |
| `--destructive` | `oklch(0.58 0.22 27)` | errors / destructive |
| `--success` | `oklch(0.55 0.16 155)` | positive state |
| `--warning` | `oklch(0.60 0.14 75)` | caution state |
| `--info` | `oklch(0.52 0.15 240)` | informational state |
| `--border` / `--input` | `oklch(0.92 0.007 255)` | hairlines / fields |
| `--ring` | `oklch(0.52 0.18 264)` | focus ring |
| `--chart-1..5` | `0.52 0.18 264` · `0.58 0.13 185` · `0.66 0.15 75` · `0.60 0.16 8` · `0.55 0.17 300` | data series |
| `--radius` | `0.375rem` | base radius (cascades `--radius-sm..4xl`) |

### Dark (`.dark`)

Calibrated for perceptual parity. Key shifts: `--background oklch(0.17 0.015 262)`, `--card oklch(0.21 0.018 262)` (genuinely elevated), `--primary oklch(0.64 0.17 264)`, `--border oklch(1 0 0 / 14%)`, success/warning/info lightened for parity. Full values in `app/globals.css`.

## Elevation

Tokens: `shadow-xs · shadow-sm · shadow-md · shadow-lg · shadow-xl` (per-theme; tinted soft in light, near-black + ambient in dark). `.elevate-hairline` adds a machined top edge in dark.

**Policy:** shadows signal interaction/overlay only. Resting content is **border-led in light, shadow-led in dark**.

| Surface | Light | Dark |
|---|---|---|
| Card rest | `shadow-xs` + border | `shadow-sm` + border |
| Card hover (interactive) | `.lift` (→ `shadow-md` + `-translateY(1px)`) | same |
| Sidebar | flat + `border-r` | flat + hairline |
| Dropdown / Popover | `shadow-lg` | `shadow-lg` + `.elevate-hairline` |
| Dialog / Sheet | `shadow-xl` | `shadow-xl` + `.elevate-hairline` |

## Motion

Tokens: `--ease-out` (cubic-bezier .16,1,.3,1) · `--ease-standard` (.4,0,.2,1) · `--ease-exit` (.4,0,1,1) · `--duration-instant 0ms` · `--duration-fast 120ms` · `--duration-base 200ms` · `--duration-slow 320ms`.

Utilities: `.transition-ds` (hover/focus on interactive primitives, fast/ease-out), `.press` (`scale(0.97)` active), `.lift` (card hover elevation). Never `transition: all`. `--duration-slow` is dialog/drawer-enter only. `prefers-reduced-motion` collapses transforms to instant, keeps opacity. Do not animate: content box size, table rows/list re-renders, keyboard toggles, numeric cells, focus ring delay.

## Spacing

4px base. Use only steps `0.5,1,1.5,2,3,4,6,8,12,16` (= 2/4/6/8/12/16/24/32/48/64px). Field gap `gap-2`, form rhythm `space-y-4`, card padding `p-4`/`p-6`, section gap `space-y-6`, page container `px-6 py-6` (provided by `(app)` layout — don't double-pad). Table cell `px-3 py-2`.

## Shared primitives (`components/shared/`)

| Component | Use |
|---|---|
| `EmptyState` | no-data screens — `icon`, `title`, `description`, `action` |
| `ErrorState` | failure screens — `title`, `description`, `action` |
| `SkeletonRows` | loading — `rows`, `cols` |
| `FormError` | inline form/server error — `message` |

Reuse these; do not author new empty/error/skeleton patterns. Status badges: `Badge` variants `success | warning | info | destructive | outline` (don't hand-roll `bg-x/10 text-x`).

## Data tables

Compact rows; header `bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground`; border-separated (not zebra); `.transition-ds hover:bg-muted/40` rows; numerics `font-mono tabular` right-aligned; `EmptyState` for zero rows.

## Audit

`scripts/ds-audit.sh [paths]` fails on raw palette classes, `#hex`, `[oklch/rgb/hsl]`, inline color/font styles. The only known allowed exception is `components/ui/chart.tsx` (recharts internal selectors — shadcn baseline, do not modify).
