# Officers Mess

A platform to manage an Officers Mess across multiple Units: ration scales, bar consumption, guest rooms, parties — with a versioned REST API so mobile apps can consume the same backend.

**Stack:** Next.js 16.2 (App Router) + React 19, MongoDB, Better Auth, shadcn/ui, Tailwind v4, TypeScript.

---

## Prerequisites

- Node.js 20+
- MongoDB 6+ (local MongoDB instance, Docker container, or MongoDB Atlas connection)

## First-time setup

```bash
# 1. Install deps
npm install

# 2. Start your MongoDB instance (local service, Docker, or Atlas)
# Example using Docker:
docker run -d --name mess-mongo -p 27017:27017 mongo:7

# 3. Copy env template and set environment variables
cp .env.local.example .env.local
# Edit .env.local — set MONGODB_URI and BETTER_AUTH_SECRET:
# MONGODB_URI=mongodb://localhost:27017/mess
# BETTER_AUTH_SECRET=your-32-char-random-secret
# BETTER_AUTH_URL=http://localhost:3000

# 4. Bootstrap your first admin user (super_admin)
npx dotenv -e .env.local -- tsx scripts/bootstrap-admin.ts admin@example.mil "supersecret" "Admin"

# 5. Start Next.js
npm run dev
```

Open http://localhost:3000, click **Sign in**, log in as the admin you just created.

## Project structure

```
app/
├── (marketing)/         public landing page
├── (auth)/              sign-in
├── (app)/               authenticated ops app (messing, attendance, ration, bar, guest-rooms, billing, etc.)
│   ├── dashboard/
│   ├── messing/         daily messing sheets & cuts
│   ├── ration/          scales, consumption & ledger
│   ├── bar/             bar inventory & consumption
│   ├── guest-rooms/     room bookings & bills
│   ├── billing/         monthly & mess billing
│   ├── users/           unit user management & capabilities
│   └── settings/        profile & preferences
├── api/
│   ├── v1/              versioned REST API (bearer token, for mobile)
│   ├── auth/[...all]/   Better Auth route handler
│   └── admin/           admin endpoints
└── auth/                auth confirmation and signout routes

lib/
├── mongo.ts             MongoDB client, DB connection, collection helpers
├── auth/                Better Auth config, getCurrentUser, requireRole, requireCapability
├── api/                 withRoute, requireApiUser, rate-limit, idempotency
├── schemas/             zod schemas (shared between web + /api)
└── [module]/            queries, mutations, and actions per operational domain

scripts/
└── bootstrap-admin.ts   seed initial admin user into MongoDB

proxy.ts                 Next.js 16 proxy (replaces middleware.ts)
```

## Roles + Capabilities

Authorization has two layers:

**Roles** (`users.role`):
- `user` — sees own data only.
- `manager` — operator; **only does what unit-admin has granted via capabilities**.
- `unit_admin` — runs one unit: manages its users, grants capabilities, finalizes data.
- `super_admin` — platform admin across all units; manages units, global masters, capability templates.

**Capabilities** (`users.capabilities`): per-user, optionally unit-scoped grants — e.g. `bar.write`, `attendance.write`, `masters.write`. Bundled into `capability_templates` like *Bar NCO*, *Mess Havildar*, *Quartermaster*, *Guest Room Clerk*, *Party Coordinator* for one-click assignment when inviting a manager.

Admins switch their active unit from the navbar combobox; non-admins are pinned to their home unit.

## Database & Authentication

- **Database:** MongoDB documents store domain entities (`units`, `users`, `accounts`, `sessions`, `items`, `item_versions`, `audit_log`, `bookings`, `bills`, etc.).
- **Better Auth:** Authentication is powered by Better Auth using the MongoDB adapter (`@better-auth/mongo-adapter`), featuring session cookies and bearer token authentication for mobile/API clients. `BETTER_AUTH_SECRET` is required.
- **Audit:** `audit_log` collection records mutations across units, users, masters, and operational modules.
- **Item Versioning:** Master items are versioned via `item_versions` (SCD Type 2). Historical bills reference the version that was current at issue time, ensuring rate changes don't rewrite history.
- **Session & Capability Claims:** Role, `unit_id`, and `capabilities` are stored directly on the user record and cached in Better Auth session context for high-performance authorization checks across server components and API routes.

## API

The versioned REST API lives under `/api/v1/*`. Mobile clients send `Authorization: Bearer <token>` (issued by Better Auth via `/api/v1/auth/sign-in`). Endpoints share zod schemas with the web forms (`lib/schemas/`).

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

```bash
npm run dev               # Next.js dev server
npm run build             # production build
npm run start             # production server
npm run lint              # ESLint check
npm run test              # Vitest test runner
# Bootstrap admin user:
npx dotenv -e .env.local -- tsx scripts/bootstrap-admin.ts <email> <password> [full_name]
```

## Production Deployment

1. Provision a MongoDB instance (e.g. MongoDB Atlas cluster or self-hosted MongoDB replica set).
2. Configure environment variables on your hosting platform (Vercel, container host, etc.):
   - `MONGODB_URI`: connection string to your MongoDB cluster
   - `BETTER_AUTH_SECRET`: secure random 32+ character key
   - `BETTER_AUTH_URL` / `NEXT_PUBLIC_SITE_URL`: canonical production URL (e.g. `https://mess-manager.com`)
   - `RESEND_API_KEY`: API key for sending invitation, recovery, and verification emails
3. Bootstrap the initial administrator user via `scripts/bootstrap-admin.ts`.
4. Deploy the Next.js application to Vercel or your Docker/Node.js host.

## Roadmap (modules planned)

- **Operations** — Attendance, Ration issuing, Bar consumption, Guest rooms, Parties.
- **Billing** — Messing/bar/room bills with draft → finalize → paid workflow.
- **Reports** — Per-unit and cross-unit dashboards.

Each module slots into the existing foundation (capabilities, audit_log, item_versions, unit scoping) without touching the auth or admin surface.
