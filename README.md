# Officers Mess

A platform to manage an Officers Mess across multiple Units: ration scales, bar consumption, guest rooms, parties — with a versioned REST API so mobile apps can consume the same backend.

**Stack:** Next.js 16.2 (App Router) + React 19, Supabase (Postgres + Auth + RLS), shadcn/ui, Tailwind v4, TypeScript.

---

## Prerequisites

- Node.js 20+
- Docker (for the local Supabase stack)
- Supabase CLI (`brew install supabase/tap/supabase` on macOS)

## First-time setup

```bash
# 1. Install deps
npm install

# 2. Start the local Supabase stack (Postgres, GoTrue, Storage, Studio).
#    First run downloads several GB of images.
npm run db:start

# 3. Copy env template, then paste the keys printed by `npm run db:start`
cp .env.local.example .env.local
# Edit .env.local — set NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
# Run `supabase status -o env` if you need to print them again.

# 4. Apply migrations + load seed data
npm run db:reset

# 5. Generate TypeScript types from the live schema
npm run db:types

# 6. Create your first admin user
npm run bootstrap-admin -- admin@example.mil "supersecret" "Admin"

# 7. Start Next.js
npm run dev
```

Open http://localhost:3000, click **Sign in**, log in as the admin you just created.

## Project structure

```
app/
├── (marketing)/         public landing page
├── (auth)/              sign-in, forgot-password, reset-password, accept-invite
├── (app)/               authenticated app (sidebar + navbar + UnitSwitcher)
│   ├── dashboard/
│   ├── settings/        own profile
│   └── admin/
│       ├── users/       invite, manage, grant capabilities
│       ├── units/       admin only
│       ├── masters/     ration, soft-drinks, alcohol, cigar, grocery
│       ├── capabilities/ manage capability templates (admin)
│       └── audit/       audit log (admin)
├── api/
│   ├── v1/              versioned REST API (bearer JWT, for mobile)
│   └── admin/           cookie-authed admin endpoints (used by web UI)
└── auth/callback/       Supabase code exchange endpoint

lib/
├── supabase/            server.ts, client.ts, service.ts, middleware.ts
├── auth/                getCurrentUser, requireRole, requireCapability
├── api/                 withRoute, requireApiUser, rate-limit, idempotency
├── schemas/             zod schemas (shared between web + /api)
└── masters/             masters queries + server actions

supabase/
├── migrations/          versioned SQL
├── seed.sql             sample units + items for local dev
└── config.toml          local supabase config (auth hook enabled here)

proxy.ts                 Next.js 16 proxy (replaces middleware.ts)
```

## Roles + Capabilities

Authorization has two layers:

**Roles** (`profiles.role`):
- `user` — sees own data only.
- `manager` — operator; **only does what unit-admin has granted via capabilities**.
- `unit_admin` — runs one unit: manages its users, grants capabilities, finalizes data.
- `admin` — super-admin across all units; manages units, global masters, capability templates.

**Capabilities** (`user_capabilities`): per-user, optionally unit-scoped grants — e.g. `bar.write`, `attendance.write`, `masters.write`. Bundled into `capability_templates` like *Bar NCO*, *Mess Havildar*, *Quartermaster*, *Guest Room Clerk*, *Party Coordinator* for one-click assignment when inviting a manager.

Admins switch their active unit from the navbar combobox; non-admins are pinned to their home unit.

## Database

- Migrations live in `supabase/migrations/` (10 files for the foundation).
- `audit_log` records every change to masters, profiles, units, and capabilities — viewable at `/admin/audit`.
- Master items are versioned via `item_versions` (SCD Type 2). Historical bills reference the version that was current at issue time, so rate changes don't rewrite history. See `set_item_rate()` SQL helper.
- A Supabase **Custom Access Token Hook** mirrors `profiles.role` + `unit_id` into `app_metadata` JWT claims so RLS reads them as fast claims, not per-row subqueries. Configured in `supabase/config.toml` under `[auth.hook.custom_access_token]` for local; **on Supabase Cloud, enable it in Dashboard → Authentication → Hooks → Custom Access Token Hook → `app.custom_access_token_hook`**.

## API

The versioned REST API lives under `/api/v1/*`. Mobile clients send `Authorization: Bearer <Supabase access token>`. Endpoints share zod schemas with the web forms (`lib/schemas/`).

Documentation: visit `/api/v1/docs` (Scalar UI) or fetch `/api/v1/openapi.json`.

Key endpoints (foundation phase):

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/auth/sign-in` | Returns access + refresh tokens |
| GET | `/api/v1/me` | Profile + role + capabilities |
| GET, POST | `/api/v1/units` | Admin to create |
| GET, POST | `/api/v1/users` | Invite, list (scoped by role) |
| GET, PUT | `/api/v1/users/:id/capabilities` | Bulk-set grants |
| GET, POST, PATCH, DELETE | `/api/v1/items` and `/items/:id` | `?category=` required for list |
| GET, POST | `/api/v1/items/:id/versions` | Version history + new version |
| GET, POST, PATCH, DELETE | `/api/v1/capability-templates` |  |

All POSTs accept `Idempotency-Key`. Auth and write endpoints are rate-limited via Upstash (set `UPSTASH_REDIS_REST_*` env vars to enable; without them, rate limiting is a no-op).

## Scripts

```
npm run dev               # Next.js dev server
npm run build             # production build
npm run lint
npm run db:start          # supabase start
npm run db:stop
npm run db:reset          # apply all migrations + seed
npm run db:types          # regenerate lib/supabase/database.types.ts
npm run db:diff           # diff local DB against migrations (during schema changes)
npm run bootstrap-admin   # create or promote an admin user
```

## Deploying to Supabase Cloud

1. Create a project at https://supabase.com.
2. Set `.env.local` (or your Vercel env vars) to the cloud project's URL + keys.
3. Push migrations: `supabase link --project-ref <ref>` then `supabase db push`.
4. **Enable the auth hook in Dashboard** → Authentication → Hooks → Custom Access Token Hook → `app.custom_access_token_hook`.
5. (Optional) Configure SMTP under Authentication → Email so password-reset and invite mail reaches real inboxes.
6. Set `NEXT_PUBLIC_SITE_URL` to your production domain so reset/invite links point to it.
7. Run `npm run bootstrap-admin -- you@yourmess.example "..."` against the cloud project.
8. Deploy the Next.js app to Vercel.

## Roadmap (modules planned)

- **Operations** — Attendance, Ration issuing, Bar consumption, Guest rooms, Parties.
- **Billing** — Messing/bar/room bills with draft → finalize → paid workflow.
- **Reports** — Per-unit and cross-unit dashboards.

Each module slots into the existing foundation (capabilities, audit_log, item_versions, unit scoping) without touching the auth or admin surface.
