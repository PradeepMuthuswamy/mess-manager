<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.2) has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Key rename: **Middleware → Proxy**. The file is `proxy.ts` at project root, exports a `proxy` function (not `middleware`). Same runtime semantics as Next 15 middleware. See `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
<!-- END:nextjs-agent-rules -->

# For future sessions — start here

Before doing anything else in this repo, load context from these two places:

1. **Persistent memory** (project facts, design-system rule, Supabase project ref, dev workflow):
   `~/.claude/projects/-Users-pradeepmuthuswamy-Developer-Projects-officers-mess-officers-mess/memory/MEMORY.md`
   That file is the index — it lists `project-overview.md`, `supabase-project.md`, `design-system.md`, `nextjs-16-proxy.md`, `dev-workflow.md`. Read the index, then any entry whose hook matches the current task. Update memories when facts change; don't write duplicates.

2. **Open tasks** — run `TaskList` to see the live backlog. Operational modules tracked: Messing, Attendance, Ration, Bar, Party, Guest Rooms, Billing, plus Reports. Each currently has a capability-gated route stub at `/<slug>` and a sidebar entry; the real workflows still need to be built. Guest Rooms has the most scaffolding (Gemini-written components + a `20260512080013_guest_rooms.sql` migration on disk that is **not yet applied** to remote). When you start a module, set its task to `in_progress` via `TaskUpdate`; mark `completed` only when the module is actually shipped (migration applied, UI replaces the placeholder, API route under `/api/v1` exists, capability + audit wired). Add new tasks for sub-work discovered along the way.

If you finish or change scope, update the memory **and** the task list before ending the session so the next pick-up is clean.

# Officers Mess — project scope

A multi-unit Officers Mess platform: ration scales, bar consumption, guest rooms, parties, billing. SSR web app + versioned REST API (`/api/v1/*`) so a future mobile client shares the backend.

**Stack:** Next.js 16.2 (App Router, React 19) · Supabase (Postgres + Auth + RLS) · shadcn/ui · Tailwind v4 · TypeScript · zod · Upstash rate limit.

## What is built (foundation)

- **Auth:** Supabase SSR with cookie sessions refreshed in `proxy.ts`. Custom Access Token Hook function (`app.custom_access_token_hook`) mirrors `role` + `unit_id` into JWT `app_metadata` for fast RLS claims. **The hook is not yet enabled in the Supabase Dashboard**; migration `0014_role_lookup_fallback` lets `app.current_role()` / `app.current_unit_id()` fall back to a `profiles` lookup so the app works without it (one extra DB read per RLS evaluation).
- **RBAC:** roles (`user` / `manager` / `unit_admin` / `admin`) + capabilities bundled into `capability_templates`. Seeded templates: **Bar NCO**, **Mess Havildar** (full operational access in unit), **Mess Secretary** and **PMC** (admin-grade — recommended to also set role to `unit_admin`), Quartermaster, Guest Room Clerk, Party Coordinator. Helper functions (`app.is_admin()`, `app.has_capability()`, `app.current_role()`, etc.) are all `SECURITY DEFINER set search_path = ''`.
- **Units:** multi-tenant. Admins switch active unit via navbar (`setActiveUnitAction`, admin-only); non-admins pinned to home unit. First admin user: `pradeep@commandhq.in` (created via bootstrap SQL, not the `bootstrap-admin` script — that script trips the `profiles_unit_required` check; see "Known footguns" below).
- **Masters:** versioned (SCD-2) via `item_versions` and `set_item_rate()`. Categories: ration, soft-drinks, alcohol, cigar, grocery, room (room category exists in the enum but no admin UI; managed per-unit inside the guest-rooms feature). Each masters page has a **Bulk import** button — paste CSV, preview rows, batch-import via `set_item_rate`.
- **Audit:** every change to masters/profiles/units/capabilities written to `audit_log`, surfaced at `/admin/audit`.
- **REST API:** `/api/v1/*` (bearer JWT), shared zod schemas, `Idempotency-Key` accepted, rate-limited via Upstash, Scalar docs at `/api/v1/docs`. Admin-only `/api/admin/invite-user` uses session-cookie auth (web-app flow, not bearer).
- **Navigation:** sidebar swaps based on URL — **NAV_OPS** under `/dashboard`, `/messing`, `/attendance`, `/ration`, `/bar`, `/party`, `/guest-rooms`, `/billing`, `/settings`; **NAV_ADMIN** under `/admin/*` (Admin home, Masters/5 children, Users, Units, Capabilities, Audit). Admins/unit_admins see an "Admin console ↗ / ← Operations" toggle in the navbar.
- **Admin pages:** `/admin` landing, users (invite + capability grant with friendly labels), units, masters (5 categories + bulk import), capability templates, audit.
- **Ops pages:** route stubs only — capability-gated landing screens that list what the role unlocks. Real workflows still TODO.
- **Marketing:** `/` shows "Dashboard" CTA to signed-in users, "Sign in" otherwise.

Migrations applied to remote (`lscphcinsukrdaoytbsx`, 15 total):
`20260512080001_init` → `20260512080002_units` → `_profiles` → `_items` → `_capabilities` → `_audit` → `_auth_token_hook` → `_rls` → `_views` → `_idempotency` → `0011_app_schema_grants` → `0012_role_templates` → `0013_item_category_room` → `0014_role_lookup_fallback` → `0015_helpers_security_definer`.

**On disk but NOT applied:** `20260512080013_guest_rooms.sql` (Gemini-written; creates `rooms` / `bookings` / `room_bills` / `room_bill_items` with INSERT/UPDATE policies but no DELETE policies). Patch the policies before applying.

## Conventions

### File structure
```
app/(marketing)/  app/(auth)/  app/(app)/{dashboard,settings,admin/*}/  app/api/{v1,admin}/  app/auth/callback/
lib/{supabase,auth,api,schemas,masters}/   proxy.ts (NOT middleware.ts)   supabase/{migrations,seed.sql,config.toml}
```

### Design system — no hardcoded colors or fonts
- The design system lives in `app/globals.css` as `oklch()` tokens mapped through Tailwind v4's `@theme inline` block. Use semantic classes only.
- **Allowed:** `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card`, `bg-muted`, `bg-primary`, `text-primary`, `bg-accent`, `bg-destructive`, `text-destructive`, `border-border`, `ring-ring`, `bg-popover`, `bg-sidebar`, `text-sidebar-foreground`, `bg-chart-1..5`. Opacity modifiers fine (`bg-primary/10`). Token-based font classes: `font-sans`, `font-mono`, `font-heading`.
- **Banned:** raw palette classes (`text-gray-500`, `bg-emerald-500`, `text-red-700`, `bg-white`, `text-black`), arbitrary color values (`text-[#abc]`, `bg-[oklch(...)]`, `bg-[rgb(...)]`), inline color/font styles (`style={{ color, background, fontFamily }}`), custom `font-family` declarations.
- **Fonts:** `Geist` is wired into `--font-sans` and `Geist_Mono` into `--font-geist-mono` in `app/layout.tsx`. Do **not** rename these CSS variables — `globals.css` reads them.
- **shadcn baseline (`components/ui/*`)** is already token-based; do not "fix" it.

### Auth & data access
- **Server components / server actions:** import from `lib/supabase/server.ts` (cookies-aware SSR client) or `lib/supabase/service.ts` (service role; server-only; bypasses RLS — use sparingly).
- **Client components:** `lib/supabase/client.ts`.
- **API routes (`/api/v1/*`):** wrap handlers with `withRoute` from `lib/api/`; use `requireApiUser`, capability helpers from `lib/auth/`. Idempotency + rate-limit are built into the wrapper.
- **Page-level authorization:** `getCurrentUser`, `requireRole`, `requireCapability` from `lib/auth/`.
- **Schemas:** define once in `lib/schemas/`, share between web forms and `/api/v1`.

### Database changes
- Always add a new migration in `supabase/migrations/` — never edit applied ones.
- After schema change: `npm run db:reset` then `npm run db:types` to regenerate `lib/supabase/database.types.ts`.
- New tables that need history → write the change to `audit_log` via the existing trigger pattern.
- New rate-driven master → use `set_item_rate()` and `item_versions`, not direct UPDATE.

### Proxy (middleware) discipline
Per Next 16 docs: `proxy.ts` is for **optimistic** auth checks and cookie refresh — not full authorization. Every API route still authenticates itself. Do not push business logic into the proxy.

## Workflow

```bash
npm run dev               # Next.js dev server
npm run db:start          # local Supabase stack
npm run db:reset          # apply migrations + seed
npm run db:types          # regenerate TS types from live schema
npm run db:diff           # diff local DB vs migrations during schema work
npm run bootstrap-admin   # create or promote an admin user
npm run lint
```

`.env.local` must define `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`. `UPSTASH_REDIS_REST_*` are optional (rate-limit no-ops without them). Service role key cannot be fetched via Supabase MCP — grab it from the dashboard.

## Roadmap (real workflows still to build)

All operational routes exist as capability-gated **placeholder pages** that show "module coming online" plus the capabilities the role unlocks. The actual forms, queries, and reports are TBD.

| Route | Capability | Status |
|---|---|---|
| `/messing` | `attendance.read` | placeholder |
| `/attendance` | `attendance.read` | placeholder |
| `/ration` | `ration.read` | placeholder |
| `/bar` | `bar.read` | placeholder |
| `/party` | `parties.read` | placeholder |
| `/guest-rooms` | `rooms.read` | **partial** — Gemini-written components (calendar, bookings table, rooms list, booking/room forms, billing dialog) wired up against `lib/guest-rooms/{queries,actions,types}.ts`. Blocked: the underlying `rooms` / `bookings` / `room_bills` / `room_bill_items` tables (in `20260512080013_guest_rooms.sql`) are **not deployed** to remote — the page renders "Could not find the table 'public.bookings' in the schema cache" until that migration is patched + applied. |
| `/billing` | `billing.read` | placeholder |
| Reports | `reports.unit` / `reports.cross_unit` | not even a stub |

Each module plugs into the existing foundation (capabilities, audit_log, item_versions, unit scoping) without touching auth or admin surfaces.

## Known footguns (read before touching these)

1. **`handle_new_user` trigger vs `profiles_unit_required` check** — the auth trigger creates a profile with `role='user'` and `unit_id=null`, which violates the `profiles_unit_required` check (`role = 'admin' or unit_id is not null`). Affects: `npm run bootstrap-admin`, the invite flow when a user accepts their invite. Workaround for the first admin: `set session_replication_role = 'replica'` and insert the profile manually with `role='admin'`. Real fix: either accept `unit_id` from `raw_user_meta_data` in the trigger, or relax the check until the admin assigns a unit. Not yet done.
2. **`server-only` modules in client bundles** — types defined in a `server-only` file leak into client components even when imported as types (Turbopack still resolves the module). Pattern: put shared row types in `lib/<feature>/types.ts` (no `server-only`) and have `queries.ts` re-export from there. Client components must use `import type { ... }`.
3. **`active_unit_id` cookie is admin-only** — `setActiveUnitAction` now requires `admin` role; the navbar `UnitSwitcher` is only rendered for admins. Don't expose the cookie to unit_admins; their `home_unit_id` is the only unit they should see.
4. **Service-role client bypasses RLS** — `lib/supabase/service.ts` is used by `inviteUserAction` and `acceptInviteAction`. Anything in those paths must do its own role/capability check before mutating; RLS won't catch you.

## Permissions checklist (every new feature MUST tick all of these)

Auth lives in three layers. Skipping any one of them is a bug, not a shortcut.

**Page (server component) — `app/(app)/**/page.tsx`**
- Always call exactly one of `requireUser()`, `requireRole([...])`, or `requireCapability('xxx.read', unitId?)` at the top of the page function.
- If the page is reachable without server-side data the user can already see freely (e.g. settings shell, marketing), `requireUser()` is enough.
- Admin-only pages live under `/admin/*` and inherit the `admin/layout.tsx` redirect, but still **add an explicit gate at the page** so the auth contract is visible at the call site.

**Server action — every exported function in a file marked `'use server'`**
- First line of the function (after parsing): `await requireCapability(cap, unitId)` for mutations, or `await requireRole([...])` for admin-only actions. **Never rely solely on RLS** — RLS gives you a silent "no rows" instead of a 403, which hides bugs and aids enumeration.
- If the action uses the service role client (`lib/supabase/service.ts`), the auth gate is the **only** line of defence. Document with a comment why service role is needed.
- If the action takes a `unit_id`, pass it to the capability check (`requireCapability('x.write', unit_id)`).

**API route — `app/api/v1/**/route.ts`**
- Use the `withRoute(...)` wrapper from `lib/api/`. It handles bearer auth, capability checks, idempotency-key persistence, and rate-limiting. Don't roll your own.
- For write methods, declare an `Idempotency-Key` requirement in the wrapper config.
- For read methods that return lists, apply the read rate-limit bucket.

**Database — every new table**
- `alter table ... enable row level security;` is mandatory, even for "internal" tables. RLS is opt-out, not opt-in.
- One `policy ... for select` per intended reader, one `policy ... for insert/update/delete` per intended writer. Don't use `for all to authenticated using (true)` — be explicit.
- Helper functions in schema `app` that are called from policies must be `security definer set search_path = ''`. Otherwise a future policy can produce a recursive RLS evaluation.
- Wire the new table into the audit trigger (`for each row execute function app.audit_trigger()`) if it carries business state.
- Grant `usage on schema app` and `execute` on any new helpers to `authenticated, anon`.

**Schemas — `lib/schemas/`**
- One zod schema per shape; share between the web form, server action, and `/api/v1/*` route. If you find yourself redefining the same shape, stop and reuse.

**When in doubt**
- Run the audit pattern: `grep -rn "'use server'" lib app | xargs grep -L "requireCapability\\|requireRole\\|requireUser"`. Any hit is a missing gate.
