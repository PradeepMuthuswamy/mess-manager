# Officers Mess Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the zero-chroma shadcn default with a calibrated "Modern Defence SaaS" design system (color, type, elevation, motion) delivered purely via semantic tokens, then hand-polish every page against it.

**Architecture:** Phase 1 rewrites the token foundation in `app/globals.css` + `app/layout.tsx` + base layer + shared primitives (sequential, gated by build). Phase 2 fans out 20–30 parallel agents, one per route group, each invoking the design skills and constrained to semantic tokens. Phase 3 sweeps for consistency and writes a static reference.

**Tech Stack:** Next.js 16.2 (App Router), React 19, Tailwind v4 (`@theme inline`), shadcn/ui, OKLCH color, Space Grotesk + Geist (next/font/google).

**Source spec:** `docs/superpowers/specs/2026-05-16-design-system-design.md` (read it fully before starting; it is the single source of truth for every token value).

---

## Conventions for every task

- Branch: work on `design-system` branch (created in Task 0). Never commit to `main`.
- After any file change in `app/` or `components/`, run the audit grep (Task 0 defines it) on touched files — zero new hits is mandatory.
- Semantic tokens only. The full allowed token vocabulary is the spec's "Token Design" section + AGENTS.md "Design system" rules.
- Never touch auth/data/server logic. Visual + token + className changes only. Server components keep their `requireUser/requireRole/requireCapability` calls byte-identical.
- Commit after each task with `git add <exact files>` (never `git add -A`).

---

## Task 0: Branch + baseline capture

**Files:** none (git + verification only)

- [ ] **Step 1: Create the working branch**

Run: `git checkout -b design-system`
Expected: `Switched to a new branch 'design-system'`

- [ ] **Step 2: Record the audit grep as a script for reuse**

Create: `scripts/ds-audit.sh`

```bash
#!/usr/bin/env bash
# Design-system token audit. Usage: scripts/ds-audit.sh [path ...]
# Exits non-zero if any banned raw color / font / inline style is found.
set -euo pipefail
TARGETS=("${@:-app components}")
PATTERN='text-(gray|red|green|blue|emerald|slate|zinc|neutral|stone|amber|rose|indigo|violet|teal|cyan|sky|lime|orange|yellow|fuchsia|pink|purple)-[0-9]|bg-(gray|red|green|blue|emerald|slate|zinc|neutral|stone|amber|rose|indigo|violet|teal|cyan|sky|lime|orange|yellow|fuchsia|pink|purple)-[0-9]|border-(gray|red|green|blue|emerald|slate|zinc|neutral|stone)-[0-9]|#[0-9a-fA-F]{3,6}\b|\[oklch|\[rgb|\[hsl|style=\{\{[^}]*(color|background|fontFamily)'
if grep -rnE "$PATTERN" "${TARGETS[@]}" --include='*.tsx' --include='*.ts' --include='*.css' 2>/dev/null; then
  echo "DS AUDIT: FAIL — banned token(s) above"; exit 1
fi
echo "DS AUDIT: PASS (${TARGETS[*]})"
```

- [ ] **Step 3: Make it executable and capture the pre-existing baseline**

Run: `chmod +x scripts/ds-audit.sh && scripts/ds-audit.sh app components > /tmp/ds-baseline.txt 2>&1; cat /tmp/ds-baseline.txt`
Expected: Either `DS AUDIT: PASS` or a list of pre-existing violations. **Save this list** — Phase 2 agents must not ADD hits; pre-existing hits in untouched files are out of scope but pre-existing hits in a file an agent edits MUST be fixed by that agent.

- [ ] **Step 4: Capture the auth-contract baseline (must stay unchanged)**

Run: `grep -rln "'use server'" lib app | xargs grep -L "requireCapability\|requireRole\|requireUser" | sort > /tmp/auth-baseline.txt; wc -l < /tmp/auth-baseline.txt`
Expected: a number (ideally 0). This exact file list must be identical at the end of Phase 3.

- [ ] **Step 5: Commit**

```bash
git add scripts/ds-audit.sh
git commit -m "chore: add design-system token audit script"
```

---

# PHASE 1 — FOUNDATION (sequential; gate before any Phase 2 fan-out)

## Task 1: Rewrite `app/globals.css` token foundation

**Files:**
- Modify: `app/globals.css` (full rewrite of `@theme inline`, `:root`, `.dark`, `@layer base`; add `@layer utilities`)

- [ ] **Step 1: Replace the entire file with the calibrated token system**

Write `app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-heading);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --ease-out: var(--ease-out);
  --ease-standard: var(--ease-standard);
  --ease-exit: var(--ease-exit);
}

:root {
  --radius: 0.375rem;

  --background: oklch(0.99 0.004 255);
  --foreground: oklch(0.24 0.02 262);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.24 0.02 262);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.24 0.02 262);
  --primary: oklch(0.52 0.18 264);
  --primary-foreground: oklch(0.99 0.003 255);
  --secondary: oklch(0.968 0.006 255);
  --secondary-foreground: oklch(0.28 0.02 262);
  --muted: oklch(0.968 0.006 255);
  --muted-foreground: oklch(0.45 0.02 262);
  --accent: oklch(0.95 0.035 264);
  --accent-foreground: oklch(0.34 0.13 264);
  --destructive: oklch(0.58 0.22 27);
  --destructive-foreground: oklch(0.99 0.01 27);
  --success: oklch(0.55 0.16 155);
  --success-foreground: oklch(0.99 0.01 155);
  --warning: oklch(0.60 0.14 75);
  --warning-foreground: oklch(0.99 0.01 75);
  --info: oklch(0.52 0.15 240);
  --info-foreground: oklch(0.99 0.01 240);
  --border: oklch(0.92 0.007 255);
  --input: oklch(0.92 0.007 255);
  --ring: oklch(0.52 0.18 264);
  --chart-1: oklch(0.52 0.18 264);
  --chart-2: oklch(0.58 0.13 185);
  --chart-3: oklch(0.66 0.15 75);
  --chart-4: oklch(0.60 0.16 8);
  --chart-5: oklch(0.55 0.17 300);
  --sidebar: oklch(0.985 0.005 255);
  --sidebar-foreground: oklch(0.30 0.02 262);
  --sidebar-primary: oklch(0.52 0.18 264);
  --sidebar-primary-foreground: oklch(0.99 0.003 255);
  --sidebar-accent: oklch(0.95 0.035 264);
  --sidebar-accent-foreground: oklch(0.32 0.13 264);
  --sidebar-border: oklch(0.92 0.007 255);
  --sidebar-ring: oklch(0.52 0.18 264);

  --shadow-xs: 0 1px 2px 0 oklch(0.24 0.02 262 / 0.05);
  --shadow-sm: 0 1px 2px -1px oklch(0.24 0.02 262 / 0.07), 0 1px 3px 0 oklch(0.24 0.02 262 / 0.06);
  --shadow-md: 0 2px 4px -2px oklch(0.24 0.02 262 / 0.08), 0 4px 10px -2px oklch(0.24 0.02 262 / 0.10);
  --shadow-lg: 0 4px 8px -3px oklch(0.24 0.02 262 / 0.10), 0 12px 24px -6px oklch(0.24 0.02 262 / 0.13);
  --shadow-xl: 0 8px 16px -6px oklch(0.24 0.02 262 / 0.12), 0 24px 48px -12px oklch(0.24 0.02 262 / 0.18);
  --hairline-inset: inset 0 1px 0 0 oklch(1 0 0 / 0);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --duration-instant: 0ms;
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
}

.dark {
  --background: oklch(0.17 0.015 262);
  --foreground: oklch(0.96 0.004 255);
  --card: oklch(0.21 0.018 262);
  --card-foreground: oklch(0.96 0.004 255);
  --popover: oklch(0.21 0.018 262);
  --popover-foreground: oklch(0.96 0.004 255);
  --primary: oklch(0.64 0.17 264);
  --primary-foreground: oklch(0.17 0.015 262);
  --secondary: oklch(0.26 0.02 262);
  --secondary-foreground: oklch(0.96 0.004 255);
  --muted: oklch(0.26 0.02 262);
  --muted-foreground: oklch(0.70 0.02 262);
  --accent: oklch(0.30 0.05 264);
  --accent-foreground: oklch(0.92 0.02 264);
  --destructive: oklch(0.66 0.20 25);
  --destructive-foreground: oklch(0.99 0.01 25);
  --success: oklch(0.74 0.15 155);
  --success-foreground: oklch(0.17 0.015 262);
  --warning: oklch(0.80 0.16 75);
  --warning-foreground: oklch(0.17 0.015 262);
  --info: oklch(0.68 0.13 240);
  --info-foreground: oklch(0.17 0.015 262);
  --border: oklch(1 0 0 / 14%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.64 0.17 264);
  --chart-1: oklch(0.64 0.17 264);
  --chart-2: oklch(0.70 0.11 185);
  --chart-3: oklch(0.72 0.15 75);
  --chart-4: oklch(0.68 0.16 8);
  --chart-5: oklch(0.66 0.16 300);
  --sidebar: oklch(0.20 0.017 262);
  --sidebar-foreground: oklch(0.90 0.01 262);
  --sidebar-primary: oklch(0.64 0.17 264);
  --sidebar-primary-foreground: oklch(0.17 0.015 262);
  --sidebar-accent: oklch(0.30 0.05 264);
  --sidebar-accent-foreground: oklch(0.92 0.02 264);
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-ring: oklch(0.64 0.17 264);

  --shadow-xs: 0 1px 2px 0 oklch(0.10 0.015 262 / 0.30);
  --shadow-sm: 0 1px 2px -1px oklch(0.10 0.015 262 / 0.34), 0 1px 3px 0 oklch(0.08 0.012 262 / 0.32);
  --shadow-md: 0 2px 5px -2px oklch(0.08 0.012 262 / 0.40), 0 6px 14px -3px oklch(0.06 0.01 262 / 0.42);
  --shadow-lg: 0 6px 12px -4px oklch(0.06 0.01 262 / 0.46), 0 16px 32px -8px oklch(0.04 0.008 262 / 0.50);
  --shadow-xl: 0 10px 22px -6px oklch(0.05 0.01 262 / 0.50), 0 32px 60px -14px oklch(0.03 0.006 262 / 0.55);
  --hairline-inset: inset 0 1px 0 0 oklch(1 0 0 / 0.06);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "cv11", "ss01";
    -webkit-font-smoothing: antialiased;
  }
  html {
    @apply font-sans;
  }
  h1, h2, h3, h4 {
    font-family: var(--font-heading), var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
  }
  h1 { letter-spacing: -0.02em; }
  h2 { letter-spacing: -0.015em; }
  h3 { letter-spacing: -0.01em; }
  h4 { letter-spacing: -0.005em; }
  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  [disabled], [aria-disabled="true"], .disabled {
    cursor: not-allowed;
  }
  ::selection {
    background: var(--accent);
    color: var(--accent-foreground);
  }
}

@layer utilities {
  .tabular { font-variant-numeric: tabular-nums; }
  .lift {
    transition: box-shadow var(--duration-base) var(--ease-out),
                transform var(--duration-base) var(--ease-out);
  }
  .lift:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }
  .elevate-hairline { box-shadow: var(--shadow-lg), var(--hairline-inset); }
  .transition-ds {
    transition: background-color var(--duration-fast) var(--ease-out),
                color var(--duration-fast) var(--ease-out),
                border-color var(--duration-fast) var(--ease-out),
                box-shadow var(--duration-fast) var(--ease-out);
  }
  .press:active { transform: scale(0.97); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .press:active { transform: none; }
}
```

- [ ] **Step 2: Verify the build compiles the new tokens**

Run: `npm run build`
Expected: build succeeds. If it fails on an unknown utility (e.g. `shadow-xs`), the `@theme inline` shadow mapping is wrong — fix the mapping, not the page.

- [ ] **Step 3: Audit + commit**

```bash
scripts/ds-audit.sh app/globals.css
git add app/globals.css
git commit -m "feat(ds): calibrated OKLCH token foundation (color, elevation, motion, radius)"
```

---

## Task 2: Wire Space Grotesk heading font

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add the font import and variable**

In `app/layout.tsx`, change the font imports and `<html>` className. Replace:

```tsx
import { Geist, Geist_Mono } from "next/font/google";
```
with:
```tsx
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
```

After the `geistMono` declaration add:

```tsx
const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});
```

Change the `<html>` className from:
```tsx
className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
```
to:
```tsx
className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
```

- [ ] **Step 2: Verify build + headings render in Space Grotesk**

Run: `npm run build`
Expected: success. (Visual confirmation happens in the Task 6 gate.)

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(ds): wire Space Grotesk via --font-heading"
```

---

## Task 3: Shared state primitives

**Files:**
- Create: `components/shared/empty-state.tsx`
- Create: `components/shared/error-state.tsx`
- Create: `components/shared/skeleton-rows.tsx`
- Create: `components/shared/form-error.tsx`

- [ ] **Step 1: EmptyState**

Create `components/shared/empty-state.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 2: ErrorState**

Create `components/shared/error-state.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-destructive">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 3: SkeletonRows**

Create `components/shared/skeleton-rows.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-9 flex-1 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: FormError**

Create `components/shared/form-error.tsx`:

```tsx
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
```

- [ ] **Step 5: Verify build, audit, commit**

Run: `npm run build && scripts/ds-audit.sh components/shared`
Expected: build success, `DS AUDIT: PASS`

```bash
git add components/shared
git commit -m "feat(ds): shared empty/error/skeleton/form-error primitives"
```

---

## Task 4: Bind motion + elevation into core shadcn primitives

**Files (modify, token/motion/shadow class additions ONLY — no structural/prop/logic changes):**
- `components/ui/button.tsx` · `components/ui/card.tsx` · `components/ui/input.tsx` · `components/ui/table.tsx` · `components/ui/badge.tsx` · `components/ui/dialog.tsx` · `components/ui/popover.tsx` · `components/ui/dropdown-menu.tsx` · `components/ui/sidebar.tsx` · `components/ui/sonner.tsx`

- [ ] **Step 1: Read each file before editing**

Run: `for f in button card input table badge dialog popover dropdown-menu sidebar sonner; do echo "== $f =="; sed -n '1,30p' components/ui/$f.tsx; done`
Expected: see current class strings. These are token-based already; you are only ADDING transition/shadow utilities.

- [ ] **Step 2: Apply these exact additions**

For each, append (do not remove existing classes):
- `button.tsx`: add `transition-ds press` to the base variants string (find the `cva("...")` base). Keep existing `transition-*` if present (replace a bare `transition-colors` with `transition-ds`).
- `card.tsx`: base card class — ensure `shadow-xs` (light) is present; add `transition-ds`.
- `input.tsx`: base — replace `transition-colors`/none with `transition-ds`.
- `table.tsx`: wrapper — add `text-sm`; cells already token-based, no color change.
- `badge.tsx`: add `success`/`warning`/`info` variants mirroring the `default` variant pattern, e.g. `success: "border-transparent bg-success text-success-foreground"` (and `warning`, `info`). Add `transition-ds` to base.
- `dialog.tsx`: content — add `shadow-xl dark:elevate-hairline`.
- `popover.tsx` + `dropdown-menu.tsx`: content — add `shadow-lg dark:elevate-hairline`.
- `sidebar.tsx`: no color change; ensure the rail/inset uses `border-sidebar-border` (already does) — verify only.
- `sonner.tsx`: pass `shadow-lg` via toastOptions class if a className prop is set; otherwise no change.

- [ ] **Step 3: Verify build + audit**

Run: `npm run build && scripts/ds-audit.sh components/ui`
Expected: build success, `DS AUDIT: PASS`

- [ ] **Step 4: Commit**

```bash
git add components/ui/button.tsx components/ui/card.tsx components/ui/input.tsx components/ui/table.tsx components/ui/badge.tsx components/ui/dialog.tsx components/ui/popover.tsx components/ui/dropdown-menu.tsx components/ui/sidebar.tsx components/ui/sonner.tsx
git commit -m "feat(ds): bind motion/elevation/state tokens into core primitives"
```

---

## Task 5: PHASE 1 GATE (mandatory before any Phase 2 agent)

**Files:** none

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: passes (no new errors vs baseline).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Full audit unchanged-or-better**

Run: `scripts/ds-audit.sh app components`
Expected: no MORE hits than `/tmp/ds-baseline.txt`.

- [ ] **Step 4: Auth contract unchanged**

Run: `grep -rln "'use server'" lib app | xargs grep -L "requireCapability\|requireRole\|requireUser" | sort | diff - /tmp/auth-baseline.txt`
Expected: empty diff.

- [ ] **Step 5: Visual smoke (human checkpoint)**

Run: `npm run dev` and view `/dashboard` and `/sign-in` in light + dark. Confirm: indigo primary, Space Grotesk headings, visible elevation on cards/popovers, no contrast regressions.
Expected: a human (or the orchestrator via screenshot) confirms before fan-out. **Phase 2 MUST NOT start until this gate is green and committed.**

- [ ] **Step 6: Tag the foundation**

```bash
git tag ds-foundation
git commit --allow-empty -m "chore(ds): phase 1 foundation gate passed"
```

---

# PHASE 2 — PAGE POLISH (parallel agents, ≤6 concurrent per wave)

**Every Phase 2 task is one dispatched agent.** Each agent's prompt MUST include this preamble (the orchestrator pastes it verbatim, substituting the task's files/scope):

> Read `docs/superpowers/specs/2026-05-16-design-system-design.md` and `AGENTS.md` "Design system" section fully. Invoke the Skill tool for `impeccable` (UX/visual audit) and `design-taste-frontend` (component/spacing discipline); invoke `ui-ux-pro-max`, `high-end-visual-design`, or `emil-design-eng` if the screen needs color/elevation/motion depth. You are polishing ONLY the files listed. Rules: semantic tokens only (vocabulary = spec Token Design + AGENTS.md); spacing snaps to 4px scale `0.5,1,1.5,2,3,4,6,8,12,16`; type per spec scale; numerics use `font-mono tabular` right-aligned; reuse `components/shared/*` primitives — do not author new empty/error/skeleton patterns; use `.lift` for interactive cards; NEVER change server logic, auth gates (`requireUser/requireRole/requireCapability` stay byte-identical), data fetching, props, or route behavior — visual/className/markup-structure only. After editing, run `scripts/ds-audit.sh <your files>` (must PASS) and `npm run build` (must succeed). Capture light+dark screenshots of the page in populated and empty states. Return: files changed, skills invoked, screenshot notes, audit/build result.

### Task 6: App shell
**Files:** `app/(app)/_components/app-sidebar.tsx`, `app-navbar.tsx`, `theme-toggle.tsx`, `unit-switcher.tsx`, `user-menu.tsx`, `module-placeholder.tsx`, `app/(app)/layout.tsx`
Focus: sidebar hierarchy (active item uses `bg-sidebar-accent text-sidebar-accent-foreground`), navbar density, the admin/ops toggle, `module-placeholder` becomes a polished `EmptyState`-based screen.

### Task 7: Dashboard
**Files:** `app/(app)/dashboard/page.tsx` (+ any `_components` it imports)
Focus: **FORBIDDEN**: hero-metric / identical stat-card grid. Lead with an operational table/list. Use chart tokens for any viz.

### Task 8: Settings
**Files:** `app/(app)/settings/page.tsx`, `app/(app)/settings/_components/ui-preferences-card.tsx`, `unit-settings-card.tsx`

### Task 9: Messing (placeholder)
**Files:** `app/(app)/messing/page.tsx` — polished placeholder via shared `EmptyState`.

### Task 10: Attendance
**Files:** `app/(app)/attendance/page.tsx`, `_components/attendance-calendar.tsx`, `attendance-roster.tsx`

### Task 11: Ration — page + cards
**Files:** `app/(app)/ration/page.tsx`, `_components/scale-card.tsx`, `terrain-switcher.tsx`, `deactivate-scale-button.tsx`

### Task 12: Ration — scale detail + tables
**Files:** `app/(app)/ration/scales/[id]/page.tsx`, `_components/scale-items-table.tsx`, `authorisation-matrix.tsx`, `version-history-sheet.tsx`

### Task 13: Ration — dialogs
**Files:** `app/(app)/ration/_components/new-scale-dialog.tsx`, `edit-scale-dialog.tsx`, `bulk-import-scale-dialog.tsx`, `bulk-update-dialog.tsx`

### Task 14: Bar (placeholder)
**Files:** `app/(app)/bar/page.tsx`

### Task 15: Party (placeholder)
**Files:** `app/(app)/party/page.tsx`

### Task 16: Billing (placeholder)
**Files:** `app/(app)/billing/page.tsx`

### Task 17: Guest Rooms — page + lists/tables
**Files:** `app/(app)/guest-rooms/page.tsx`, `_components/rooms-list.tsx`, `rooms-table.tsx`, `bookings-list.tsx`, `bookings-table.tsx`
Note: page may render a DB error (unapplied migration) — polish the error path using shared `ErrorState`; do not fix the migration.

### Task 18: Guest Rooms — calendar + forms + billing
**Files:** `app/(app)/guest-rooms/_components/bookings-calendar.tsx`, `booking-form.tsx`, `room-form.tsx`, `billing-dialog.tsx`

### Task 19: Members/Users (ops)
**Files:** `app/(app)/users/page.tsx`, `_components/users-roster.tsx`, `dependant-form-sheet.tsx`, `invite-dependant-login-sheet.tsx`

### Task 20: Admin home + shell
**Files:** `app/(app)/admin/page.tsx`, `app/(app)/admin/layout.tsx`, `app/(app)/admin/_components/master-table.tsx`

### Task 21: Admin Masters — pages
**Files:** `app/(app)/admin/masters/layout.tsx`, `masters/ration/page.tsx`, `masters/soft-drinks/page.tsx`, `masters/alcohol/page.tsx`, `masters/cigar/page.tsx`, `masters/grocery/page.tsx`

### Task 22: Admin Masters — dialogs
**Files:** `app/(app)/admin/_components/master-form-dialog.tsx`, `master-bulk-import-dialog.tsx`, `master-history-dialog.tsx`, `master-multi-edit-dialog.tsx`

### Task 23: Admin Users
**Files:** `app/(app)/admin/users/page.tsx`, `_components/users-table.tsx`, `user-invite-sheet.tsx`, `user-edit-sheet.tsx`, `capability-grant-sheet.tsx`

### Task 24: Admin Units
**Files:** `app/(app)/admin/units/page.tsx`, `units/layout.tsx`, `_components/units-table.tsx`, `unit-form-sheet.tsx`

### Task 25: Admin Capabilities
**Files:** `app/(app)/admin/capabilities/page.tsx`, `capabilities/layout.tsx`, `_components/templates-table.tsx`, `template-form-sheet.tsx`

### Task 26: Admin Audit
**Files:** `app/(app)/admin/audit/page.tsx`

### Task 27: Auth
**Files:** `app/(auth)/layout.tsx`, `sign-in/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `accept-invite/page.tsx`, `_components/auth-card.tsx`, `sign-in-form.tsx`, `forgot-password-form.tsx`, `reset-password-form.tsx`, `accept-invite-form.tsx`

### Task 28: Marketing
**Files:** `app/(marketing)/layout.tsx`, `app/(marketing)/page.tsx`

### Task 29: Global system pages
**Files:** `app/error.tsx`, `app/not-found.tsx`, `app/(app)/error.tsx`, `app/(app)/loading.tsx`, `app/(auth)/loading.tsx` — use shared `ErrorState`/`SkeletonRows`.

### Task 30: API docs page
**Files:** `app/api/v1/docs/page.tsx` — Scalar docs wrapper; polish container chrome only (do not alter the spec/embed config).

**Each task's steps (identical shape):**
- [ ] Step 1: Dispatch the agent with the preamble + this task's Files/Focus.
- [ ] Step 2: On return, run `scripts/ds-audit.sh <task files>` — must PASS.
- [ ] Step 3: Run `npm run build` — must succeed.
- [ ] Step 4: Review screenshots (light+dark) for hierarchy/density/token compliance; reject & re-dispatch if generic or off-spec.
- [ ] Step 5: Commit: `git add <task files> && git commit -m "feat(ds): polish <area>"`

---

# PHASE 3 — SWEEP + REFERENCE

## Task 31: Cross-page consistency sweep
**Files:** any flagged inconsistency (spacing rhythm, heading scale, shadow misuse, state-color misuse)

- [ ] Step 1: Dispatch one agent (invoke `impeccable`) to diff visual rhythm across all Phase-2 pages and produce a fix list.
- [ ] Step 2: Apply fixes, `scripts/ds-audit.sh app components` PASS, `npm run build` success.
- [ ] Step 3: Commit `style(ds): cross-page consistency sweep`.

## Task 32: Static design-system reference
**Files:** Create `docs/design-system.md`

- [ ] Step 1: Write a reference doc enumerating every token (color light/dark with OKLCH + intended use), the type scale table, spacing scale, elevation steps, motion tokens, and the `components/shared/*` primitives with usage snippets. Source values from the spec verbatim.
- [ ] Step 2: Commit `docs: design-system reference`.

## Task 33: FINAL GATE
**Files:** none

- [ ] Step 1: `npm run lint` — passes.
- [ ] Step 2: `npm run build` — succeeds.
- [ ] Step 3: `scripts/ds-audit.sh app components` — no hits worse than `/tmp/ds-baseline.txt`; ideally `PASS`.
- [ ] Step 4: `grep -rln "'use server'" lib app | xargs grep -L "requireCapability\|requireRole\|requireUser" | sort | diff - /tmp/auth-baseline.txt` — empty diff (auth untouched).
- [ ] Step 5: Spot-check 6 pages in light+dark for AA contrast + Space Grotesk + elevation.
- [ ] Step 6: Final commit `feat(ds): design system complete` and report summary.

---

## Self-Review

- **Spec coverage:** Color → Task 1. Type/Space Grotesk → Tasks 1,2. Spacing/tabular → Task 1 base/utilities + Phase 2 preamble. Elevation → Task 1 + Task 4. Motion → Task 1 + Task 4. Shared primitives/focus/disabled/data-tables → Tasks 1,3 + Phase 2 preamble. Every route group (full-scope override) → Tasks 6–30. Sweep + reference → Tasks 31–32. Gates → Tasks 5,33. ✔ No gaps.
- **Placeholder scan:** No "TBD/TODO"; foundation tasks carry full code; page tasks carry exact file lists + verbatim agent preamble + concrete focus + identical verification steps. ✔
- **Type consistency:** `scripts/ds-audit.sh` signature consistent across all tasks; token names match spec; `components/shared/*` filenames consistent between Task 3 (create) and Phase 2 preamble (consume). ✔
