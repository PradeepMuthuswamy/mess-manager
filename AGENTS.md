<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.2) has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Key rename: **Middleware → Proxy**. The file is `proxy.ts` at project root, exports a `proxy` function (not `middleware`). Same runtime semantics as Next 15 middleware. See `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
<!-- END:nextjs-agent-rules -->

# For future sessions — start here

Before doing anything else in this repo, load context from these two places:

1. **Persistent memory** (project facts, design-system rule, database config, dev workflow):
   `~/.claude/projects/-Users-pradeepmuthuswamy-Developer-Projects-officers-mess-officers-mess/memory/MEMORY.md`
   That file is the index — it lists `project-overview.md`, `database.md`, `design-system.md`, `nextjs-16-proxy.md`, `dev-workflow.md`. Read the index, then any entry whose hook matches the current task. Update memories when facts change; don't write duplicates.

2. **Open tasks** — run `TaskList` to see the live backlog. Operational modules tracked: Messing, Attendance, Ration, Bar, Party, Guest Rooms, Billing, plus Reports. Each currently has a capability-gated route stub at `/<slug>` and a sidebar entry; the real workflows still need to be built. Guest Rooms has the most scaffolding (Gemini-written components and MongoDB collections/queries are fully functional). When you start a module, set its task to `in_progress` via `TaskUpdate`; mark `completed` only when the module is actually shipped (collections and indexes verified, UI replaces the placeholder, API route under `/api/v1` exists, capability + audit wired). Add new tasks for sub-work discovered along the way.

If you finish or change scope, update the memory **and** the task list before ending the session so the next pick-up is clean.

# Officers Mess — project scope (Client App)

This is the client application (`officers-mess-user`) focused on per-unit, officer-facing operations (Messing, Attendance, Ration issuing, Bar consumption, Guest rooms, Parties, Billing, local Inventory lots, and Settings).

Administrative controls (multi-unit management, capability templates, global audits, global catalog setup) reside in the companion `officer-mess-admin` project. Both applications share the same MongoDB database (`mess`) via `MONGODB_URI`. Shared MongoDB document collections, TypeScript domain types, Zod schemas, and core masters actions/queries must be kept synchronized across both codebases.

**Stack:** Next.js 16.2 (App Router, React 19) · MongoDB (`mongodb` driver) · Better Auth (`better-auth` + `@better-auth/mongo-adapter`) · shadcn/ui · Tailwind v4 · TypeScript · zod · Upstash rate limit.

## What is built (foundation)

- **Auth:** Better Auth (`better-auth`) with MongoDB adapter (`@better-auth/mongo-adapter`), plugins for bearer tokens (`bearer()`) and Next.js cookies (`nextCookies()`). `BETTER_AUTH_SECRET` is required; there is no signing-secret fallback. Sessions are refreshed in `proxy.ts` using `auth.api.getSession({ headers: request.headers })`. Additional user fields (`role`, `unit_id`, `home_unit_id`, `capabilities`, `rank`, `service_number`, `status`) are managed in MongoDB collections and resolved on the server via `getCurrentUser()` in `lib/auth/get-current-user.ts`.
- **Auth emails:** magic-link mail is sent by the app via Resend (`lib/email/resend.ts`) with first-party links `${NEXT_PUBLIC_SITE_URL}/auth/confirm?token=…&type=magiclink&next=…` built by `buildAuthConfirmLink()` (`lib/auth/email-links.ts`). Password reset, forgot-password, and accept-invite were removed because they wrote credentials sign-in does not read. MFA is not part of this app.
- **App segregation:** roles `admin` and `super_admin` cannot hold a session in this app (Admin Console only) — enforced in `signInAction`, `/auth/confirm`, `proxy.ts`, and `requireUser()` (bounces stale sessions via `/auth/signout?error=admin_console`). Magic-link send skips admin profiles. The admin app inversely blocks `user`/`manager` (`error=ops_app`).
- **RBAC:** roles (`user` / `manager` / `unit_admin` / `admin` / `super_admin` / `mess_secretary` / `mess_havildar` / `bar_nco` / `property_nco`) + granular capabilities. Seeded templates: **Bar NCO**, **Mess Havildar** (full operational access in unit), **Mess Secretary** and **PMC** (admin-grade access), Quartermaster, Guest Room Clerk, Party Coordinator. Capability checks and access boundaries are enforced in application code via `userHasCapability()`, `requireCapability()`, and `requireRole()` (`lib/auth/capabilities.ts`, `lib/auth/get-current-user.ts`).
- **Units:** multi-tenant. Admins switch active unit via navbar (`setActiveUnitAction`, admin-only); non-admins pinned to home unit. First admin user created via `scripts/bootstrap-admin.ts`.
- **Masters:** categories (`ration`, `cold-drinks`, `alcohol`, `cigars`, `snacks`, `grocery`, `room`), products, and variants stored in MongoDB collections (`categories`, `products`, `product_variants`). Bulk import supports CSV upload and batch insertion.
- **Audit:** every change to masters/profiles/units/capabilities written to the MongoDB `audit_log` collection via `writeAudit()` (`lib/audit/write-audit.ts`), surfaced at `/admin/audit`.
- **REST API:** `/api/v1/*` (bearer JWT via Better Auth bearer plugin), shared zod schemas, `Idempotency-Key` accepted, rate-limited via Upstash, Scalar docs at `/api/v1/docs`. Admin-only `/api/admin/invite-user` uses session-cookie auth (web-app flow, not bearer).
- **Navigation:** sidebar swaps based on URL — **NAV_OPS** under `/dashboard`, `/messing`, `/attendance`, `/ration`, `/bar`, `/party`, `/guest-rooms`, `/billing`, `/settings`; **NAV_ADMIN** under `/admin/*` (Admin home, Masters/5 children, Users, Units, Capabilities, Audit). Admins/unit_admins see an "Admin console ↗ / ← Operations" toggle in the navbar.
- **Admin pages:** `/admin` landing, users (invite + capability grant with friendly labels), units, masters (categories + bulk import), capability templates, audit.
- **Ops pages:** route stubs and operational views for messing, bar, rooms, ration, billing.
- **Marketing:** `/` shows "Dashboard" CTA to signed-in users, "Sign in" otherwise.

**Database:** MongoDB cluster / database `mess`, configured via `MONGODB_URI` (or `MONGO_URI`) in `.env.local`. MongoDB collections store domain entities (`users`, `account`, `session`, `verification`, `units`, `audit_log`, `categories`, `products`, `product_variants`, `rooms`, `bookings`, `room_bills`, `room_bill_items`, `room_bill_orders`, etc.).

## Conventions

### File structure
```
app/(marketing)/  app/(auth)/  app/(app)/{dashboard,settings,admin/*}/  app/api/{v1,admin}/  app/auth/callback/
lib/{mongo,auth,api,schemas,masters,audit}/   proxy.ts (NOT middleware.ts)   scripts/bootstrap-admin.ts
```

### Design system — no hardcoded colors or fonts
- The design system lives in `app/globals.css` as `oklch()` tokens mapped through Tailwind v4's `@theme inline` block. Use semantic classes only.
- **Allowed:** `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card`, `bg-muted`, `bg-primary`, `text-primary`, `bg-accent`, `bg-destructive`, `text-destructive`, `border-border`, `ring-ring`, `bg-popover`, `bg-sidebar`, `text-sidebar-foreground`, `bg-chart-1..5`. Opacity modifiers fine (`bg-primary/10`). Token-based font classes: `font-sans`, `font-mono`, `font-heading`.
- **Banned:** raw palette classes (`text-gray-500`, `bg-emerald-500`, `text-red-700`, `bg-white`, `text-black`), arbitrary color values (`text-[#abc]`, `bg-[oklch(...)]`, `bg-[rgb(...)]`), inline color/font styles (`style={{ color, background, fontFamily }}`), custom `font-family` declarations.
- **Fonts:** `Geist` is wired into `--font-sans` and `Geist_Mono` into `--font-geist-mono` in `app/layout.tsx`. Do **not** rename these CSS variables — `globals.css` reads them.
- **shadcn baseline (`components/ui/*`)** is already token-based; do not "fix" it.

### Auth & data access
- **Server components / server actions:** access MongoDB collections via `getDb()` or `getCollection<T>()` from `lib/mongo.ts`. Authenticate and authorize via `getCurrentUser()`, `requireUser()`, `requireRole()`, or `requireCapability()` from `lib/auth/`.
- **Client components:** use `authClient` from `lib/auth/auth-client.ts` for authentication actions (sign in, sign out, 2FA/TOTP).
- **API routes (`/api/v1/*`):** wrap handlers with `withRoute` from `lib/api/`; use `requireApiUser`, `requireApiRole`, `requireApiCapability` from `lib/api/auth.ts`. Idempotency + rate-limit are built into the wrapper.
- **Page-level authorization:** `getCurrentUser`, `requireRole`, `requireCapability` from `lib/auth/`.
- **Schemas:** define once in `lib/schemas/`, share between web forms and `/api/v1`.

### Database changes
- Define document shapes and validation via Zod schemas in `lib/schemas/` and TypeScript domain types.
- Ensure proper MongoDB indexes are created for performance on query filters (e.g. `unit_id`, `email`, `status`).
- New operations that need history → write to `audit_log` via `writeAudit()`.

### Proxy (middleware) discipline
Per Next 16 docs: `proxy.ts` is for **optimistic** auth checks and cookie refresh — not full authorization. Every API route still authenticates itself. Do not push business logic into the proxy.

## Workflow

```bash
npm run dev               # Next.js dev server
npm run build             # Next.js production build
npm run lint              # ESLint check
npm run test              # Vitest test suite
npx tsx scripts/bootstrap-admin.ts <email> <password> [full_name] # bootstrap/promote admin user
```

`.env.local` must define `MONGODB_URI`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`. `UPSTASH_REDIS_REST_*` and `RESEND_API_KEY` are optional (rate-limit / emails no-op without them).

## Roadmap (real workflows still to build)

All operational routes exist as capability-gated **placeholder pages** that show "module coming online" plus the capabilities the role unlocks. The actual forms, queries, and reports are TBD.

| Route | Capability | Status |
|---|---|---|
| `/messing` | `attendance.read` | placeholder |
| `/attendance` | `attendance.read` | placeholder |
| `/ration` | `ration.read` | placeholder |
| `/bar` | `bar.read` | placeholder |
| `/party` | `parties.read` | placeholder |
| `/guest-rooms` | `rooms.read` | Operational — components (calendar, bookings table, rooms list, booking/room forms, billing dialog) wired up against `lib/guest-rooms/{queries,actions,types}.ts` backed by MongoDB `rooms`, `bookings`, `room_bills`, and `room_bill_items` collections. |
| `/billing` | `billing.read` | placeholder |
| Reports | `reports.unit` / `reports.cross_unit` | not even a stub |

Each module plugs into the existing foundation (capabilities, audit_log, unit scoping) without touching auth or admin surfaces.

## Known footguns (read before touching these)

1. **`server-only` modules in client bundles** — types defined in a `server-only` file leak into client components even when imported as types (Turbopack still resolves the module). Pattern: put shared row types in `lib/<feature>/types.ts` (no `server-only`) and have `queries.ts` re-export from there. Client components must use `import type { ... }`.
2. **`active_unit_id` cookie is admin-only** — `setActiveUnitAction` requires `admin` or `super_admin` role; the navbar `UnitSwitcher` is only rendered for admins. Don't expose the cookie to unit_admins; their `home_unit_id` is the only unit they should see.
3. **Explicit application-level authorization required** — MongoDB does not enforce database-level access policies. All server actions, mutations, and API routes must explicitly verify user capabilities (`requireCapability()`) and scope queries by tenant (`unit_id`).

## Permissions checklist (every new feature MUST tick all of these)

Auth lives in three layers. Skipping any one of them is a bug, not a shortcut.

**Page (server component) — `app/(app)/**/page.tsx`**
- Always call exactly one of `requireUser()`, `requireRole([...])`, or `requireCapability('xxx.read', unitId?)` at the top of the page function.
- If the page is reachable without server-side data the user can already see freely (e.g. settings shell, marketing), `requireUser()` is enough.
- Admin-only pages live under `/admin/*` and inherit the `admin/layout.tsx` redirect, but still **add an explicit gate at the page** so the auth contract is visible at the call site.

**Server action — every exported function in a file marked `'use server'`**
- First line of the function (after parsing): `await requireCapability(cap, unitId)` for mutations, or `await requireRole([...])` for admin-only actions. Always enforce capability checks explicitly at the application level before performing MongoDB mutations.
- If the action takes a `unit_id`, pass it to the capability check (`requireCapability('x.write', unit_id)`).

**API route — `app/api/v1/**/route.ts`**
- Use the `withRoute(...)` wrapper from `lib/api/`. It handles bearer auth, capability checks, idempotency-key persistence, and rate-limiting. Don't roll your own.
- For write methods, declare an `Idempotency-Key` requirement in the wrapper config.
- For read methods that return lists, apply the read rate-limit bucket.

**Database — every new collection / document model**
- Application-level multi-tenancy: Always filter MongoDB queries by `unit_id` for unit-scoped collections (e.g., `{ unit_id }` or `{ unit_id: user.home_unit_id }`).
- Wire mutations into the audit log using `await writeAudit(...)` from `lib/audit/write-audit.ts` on insert, update, and delete operations.
- Define appropriate indexes in MongoDB for query performance and uniqueness constraints.

**Schemas — `lib/schemas/`**
- One zod schema per shape; share between the web form, server action, and `/api/v1/*` route. If you find yourself redefining the same shape, stop and reuse.

**When in doubt**
- Run the audit pattern: `grep -rn "'use server'" lib app | xargs grep -L "requireCapability\\|requireRole\\|requireUser"`. Any hit is a missing gate.
