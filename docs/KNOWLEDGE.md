# Officers Mess — USER App Knowledge Document

> Codebase: `/Users/pradeepmuthuswamy/Developer/Projects/officers-mess/officers-mess` (`officers-mess-user`)
> Last rebuilt from source after the `items` → Category/Product/Variant migration fix (June 2026).

---

## 1. Purpose & audience

This is the **client/operations application** of a two-app suite for running an
Officers' Mess. It serves two audiences inside a single military unit:

- **Diners / officers** — personal dashboard, messing (meal attendance), and bills.
- **Mess staff** (Mess Secretary, PMC, Quartermaster, Bar NCO, Mess Havildar,
  Guest Room Clerk) — capability-gated operational modules: attendance roll,
  ration scales, stock lots, masters catalogue, bar chits, guest rooms,
  party bookings, billing, user management.

The companion **ADMIN app** (`/Users/pradeepmuthuswamy/Developer/Projects/officers-mess/officer-mess-admin`)
handles multi-unit administration, capability templates, and global audits.
**Both apps share ONE hosted Supabase project** (`lscphcinsukrdaoytbsx`, "Mess
Manager"). Database migrations, `lib/supabase/database.types.ts`, Zod schemas,
and the masters/ration data-layer must be kept synchronized across the two
repos — the admin app is the reference implementation; this app mirrors it.

**Stack:** Next.js 16.2 (App Router, React 19, Turbopack) · Supabase (Postgres
+ Auth + RLS, via `@supabase/ssr`) · shadcn/ui · Tailwind v4 (oklch design
tokens, see `docs/design-system.md`) · TypeScript · Zod v4 · Redux Toolkit ·
Upstash rate-limiting · Vitest.

**Next.js 16 gotcha:** middleware is renamed to **Proxy**. The file is
`proxy.ts` at the project root and exports a `proxy` function (not
`middleware`). Same runtime semantics as Next 15 middleware.

---

## 2. Route map

### 2.1 `app/(app)/*` — authenticated shell

All pages render inside `app/(app)/layout.tsx`, which calls `requireUser()`,
loads UI preferences from the `ui_prefs` cookie, fetches the unit list for the
admin `UnitSwitcher`, and wraps children in `TooltipProvider` →
`ModalStyleProvider` → `AppContextProvider` (Redux) → `SidebarProvider`.

| Route | File | Purpose | Gate |
|---|---|---|---|
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Officer landing page — welcome banner, today's meals, bookings (currently mock data). | `requireUser()` |
| `/messing` | `app/(app)/messing/page.tsx` | "My Messing" — meal registration/cuts for the diner (currently mock data). | `attendance.read` |
| `/billing` | `app/(app)/billing/page.tsx` | "My Bills" / Billing Ops — invoice list (currently mock data). | `billing.read` |
| `/attendance` | `app/(app)/attendance/page.tsx` | Daily dining-in roll + monthly calendar; roster save/finalize/reopen. | `attendance.read` |
| `/ration` | `app/(app)/ration/page.tsx` | Ration scales per (rank_class × terrain); scale items table, authorisation matrix, bulk import/update. **Awaits `listEligibleItems` in `Promise.all` (~line 100).** | `ration.read` |
| `/ration/scales/[id]` | `app/(app)/ration/scales/[id]/page.tsx` | Single scale detail — current items, edit/deactivate scale, version history. Also awaits `listEligibleItems`. | `ration.read` (scale's unit) |
| `/stock` | `app/(app)/stock/page.tsx` | Unit inventory lots per stockable category (alcohol, soft_drink, cigar, grocery); add/edit/adjust/deactivate lots. | `inventory.read` |
| `/masters` | `app/(app)/masters/page.tsx` | Operational catalogue (Category → Product → Variant) with six category tabs, search, pagination, bulk import, ration authorisation chips. | `masters.read` |
| `/bar` | `app/(app)/bar/page.tsx` | Bar operations — chit creation against members/room guests, decremented from inventory. | `bar.read` |
| `/guest-rooms` | `app/(app)/guest-rooms/page.tsx` | Rooms, bookings calendar, check-in/out, room bills & bill orders, furniture inventory. | `rooms.read` |
| `/party` | `app/(app)/party/page.tsx` | Placeholder (`ModulePlaceholder`) — party bookings module not built yet. | `parties.read` |
| `/users` | `app/(app)/users/page.tsx` | Unit user management — invite, role, capabilities (templates), activate/deactivate. | `users.read` |
| `/settings` | `app/(app)/settings/page.tsx` | Profile fields (inline server action) + unit config card (mess type, terrain) for admins/unit_admins. | `requireUser()` |

Shared shell components live in `app/(app)/_components/`:
`app-sidebar.tsx`, `app-navbar.tsx`, `nav-config.ts` (capability-gated nav:
`NAV_DINER` + `NAV_OPS`), `unit-switcher.tsx` (admin-only), `user-menu.tsx`,
`theme-toggle.tsx`, `module-placeholder.tsx`. The admin-only active-unit
cookie action is `app/(app)/_actions/active-unit.ts` (`setActiveUnitAction`).

### 2.2 Other route groups

- `app/(marketing)/page.tsx` — public landing page (`/`).
- `app/(auth)/*` — `/sign-in`, `/forgot-password`, `/reset-password`,
  `/accept-invite`, `/mfa/enroll`, `/mfa/verify`; server actions in
  `app/(auth)/actions.ts`; OAuth/email callback at `app/auth/callback/route.ts`.
- `app/api/v1/*` — bearer-JWT REST API (auth, me, items, stock, ration scales,
  attendance, bar chits, units, users, capability-templates), Scalar docs at
  `/api/v1/docs`, spec at `/api/v1/openapi.json`. All handlers wrap with
  `withRoute` from `lib/api/handler.ts`.
- `app/api/admin/invite-user/route.ts` — session-cookie (not bearer) admin
  invite endpoint.

---

## 3. Data layer (`lib/*`), module by module

All `queries.ts` files are `import 'server-only'` and use the SSR server
client. All `actions.ts` files are `'use server'` and gate with
`requireCapability`/`requireRole` before touching the DB. Shared row types
live in `lib/<feature>/types.ts` **without** `server-only` so client
components can `import type` from them.

### 3.1 `lib/masters/` — catalogue (Category → Product → Variant)

- `queries.ts`
  - `listMasterItems(categorySlug, opts)` — reads **`v_masters_search`**
    (one row per variant), filters by root category UUID
    (`00000000-0000-0000-0000-00000000000{1..6}`), full-text (`product_fts`)
    + SKU search, unit scoping (`product_unit_id is null OR = activeUnitId`),
    sort + pagination; maps each row into the legacy-shaped `MasterRow`
    (id = **variant id**, `current_rate` hardcoded 0).
  - `listMasterAuthorisations(unitId, restrict?)` — reads
    **`v_ration_scale_items_current`** to build per-item ration authorisation
    chips (`Map<item_id, AuthorisationChip[]>`). This is the deliberate
    masters → ration read-only cross-link.
- `actions.ts` (writes go to **tables**, never views)
  - `createMasterItemAction` — inserts `products` then `product_variants`
    (rolls back the product on variant failure). Capability:
    `masters.write` (unit-scoped) or `masters.write.global` (global items).
  - `updateMasterItemAction` — updates `product_variants` + parent `products`.
  - `bulkImportMasterItemsAction` — CSV/Excel rows → `products` +
    `product_variants` inserts.
  - `bulkUpdateMasterItemsAction`, `deactivateMasterItemAction` — patch /
    soft-deactivate `product_variants` (and product fields where needed).
  - Known quirk (identical in the admin app, intentionally untouched): the
    internal `CATEGORY_ID_MAP` has no `snacks` key — the snacks tab maps to
    the Grocery root via `lib/masters/categories.ts` slug mapping.
- `categories.ts` — slug ↔ `item_category` enum mapping (`snacks` →
  `grocery`, six UI slugs), `INVENTORY_CATEGORIES` allow-list,
  `CATEGORY_PACK_KIND` (volume vs count), `CATEGORY_META` labels.
- `bulk-import.ts` — `parseCsv`, `parseBulkImport`, `parseExcelBuffer/File`,
  Zod `bulkImportRowSchema`, CSV/Excel templates. Reused by the ration
  bulk-import dialog (deliberate cross-link).
- `types.ts` — `MasterRow` (legacy item shape + 9 optional variant fields:
  `product_id`, `product_name`, `product_description`, `category_name`,
  `subcategory_name`, `unit_value`, `unit_type`, `package_type`),
  `AuthorisationChip`, `VersionRow`, `ListMastersOpts`.

### 3.2 `lib/ration/` — ration scales (SCD-2 versioned authorisations)

- `queries.ts`
  - `listScales(opts)` — `ration_scales` + item counts from
    `v_ration_scale_items_current` (one round trip, grouped in JS).
  - `getScale(id)`, `getScaleByDimensions(unitId, rankClass, terrain)` —
    `ration_scales`.
  - `listScaleItemsCurrent(scaleId)` — `v_ration_scale_items_current`.
  - `listScaleItemVersions(scaleId, itemId)` — `ration_scale_item_versions`
    (filters by `variant_id`).
  - `getAuthorisationMatrix(unitId, opts?)` — pivots
    `v_ration_scale_items_current` into item × scale matrix.
  - `listEligibleItems(unitId, q?)` (line ~170) — reads **`v_items_current`**
    (the legacy-items compat view), categories `ration`/`grocery`, active,
    unit-or-global, limit 200; null-filters `id`/`name` (the generated view
    types are nullable). This is the deliberate ration → masters catalogue
    cross-link, and was the site of the historic `.from('items')` crash.
- `actions.ts` (all gated with `ration.adjust` against the scale's unit,
  except history which uses `ration.read`)
  - `createScaleAction`, `updateScaleAction`, `deleteScaleAction`
    (soft-deactivate) — `ration_scales`.
  - `upsertScaleItemAction` — RPC **`set_ration_scale_item(p_scale_id,
    p_variant_id, p_auth_qty, p_uom, p_notes?, p_effective_at)`** (SECURITY
    INVOKER SCD-2 upsert; note the param is `p_variant_id`, not `p_item_id`).
  - `removeScaleItemAction` — closes the open version row
    (`ration_scale_item_versions.valid_to = now()`).
  - `bulkUpdateScaleItemsAction` — reads open versions, computes
    set/multiply/add_percent, writes via the RPC.
  - `bulkImportScaleItemsAction` (line ~278) — resolves item names through
    **`v_items_current`** (ilike, unit-or-global, ration/grocery, ambiguity
    check), then RPC per row. The second historic `.from('items')` site.
  - `getScaleItemHistoryAction` — version history for the client sheet.
- `bulk-import.ts` — scale-item CSV schema/template; reuses `parseCsv` from
  `lib/masters/bulk-import.ts`.
- `mess-type.ts` — pure `rankClassForMessType(messType)` mapping
  (`officer|jco|or` → 1:1, `combined`/null → `null`). Safe for client AND
  server import; used by `/masters` and `/ration` pages.
- `types.ts` — `RationScaleRow`, `RationScaleItemVersionRow`,
  `RationScaleItemCurrentRow`, `RationScaleListItem`, `AuthorisationMatrixRow`,
  `RationClass`, `RationTerrain`, `EligibleItem` ({id, name, category, uom},
  where `id` is a **variant id**). Kept byte-identical with the admin repo.

### 3.3 `lib/stock/` — unit inventory lots

- `queries.ts` — `listInventory` (view **`v_unit_inventory_current`**),
  `listMasterItemsForPicker` (view **`v_items_current`** — masters picker for
  "add stock").
- `actions.ts` — `createLotsAction`, `updateLotAction`, `adjustQtyAction`,
  `deactivateLotAction`, `deactivateLotsAction` — all mutate
  **`unit_inventory`**, gated by `inventory.write`.
- `compute.ts` — pure pack/serving math (`PEG_ML`, `derivedUnitsPerPack`,
  `costPerServing`, `servingsOnHand`, `lotValue`, `consumeCost`); tested in
  `compute.test.ts`.

### 3.4 `lib/bar/` — bar chits

- `queries.ts` — `getBarInventory` (`v_unit_inventory_current`),
  `listBarChits` (`bar_chits` + joined `bar_chit_items`), `listUnitMembers`
  (`profiles`), `listActiveBookings` (`bookings` — room guests can sign chits).
- `actions.ts` — `createBarChitAction` / `createBarChitCore`: validates
  variants against **`product_variants`**, checks and decrements
  **`unit_inventory`**, inserts **`bar_chits`** + **`bar_chit_items`** with
  compensating deletes/restores on partial failure. Tested in
  `actions.test.ts`. Tables `bar_chits`/`bar_chit_items` were added by this
  app's migration `supabase/migrations/20260605000000_bar_chits.sql`.

### 3.5 `lib/attendance/`

- `queries.ts` — `getAttendanceDay`, `listDiningCandidates`,
  `getMonthlyAttendance` over **`attendance_days`**,
  **`attendance_absences`**, **`profiles`**, **`dependants`**.
- `save-core.ts` — `applyAttendanceSave`, `applyFinalize` (shared by web
  action and `/api/v1/attendance`).
- `actions.ts` — `saveAttendanceAction`, `finalizeAttendanceAction`,
  `reopenAttendanceAction`, `setDiningInAction`, `setUnitConfigAction`
  (updates **`units`** mess_type/terrain).

### 3.6 `lib/guest-rooms/`

- `queries.ts` — `getRooms` (view **`v_rooms_current`**), `getBookings`,
  `getBookingById`, `getAvailableRooms`, `getUnitFurniture`,
  `getRoomInventory`, `getDailyBookingStats` over **`rooms`**, **`bookings`**,
  **`unit_furniture`**, **`room_furniture`**.
- `actions.ts` — full booking lifecycle (`createRoomAction`,
  `createBookingAction`, `checkInAction`/`checkOutAction` + undo variants,
  `cancelBookingAction`, `deleteBookingAction`, bill item/order CRUD,
  `updateStayAndRatesAction`) over **`rooms`**, **`bookings`**,
  **`room_bills`**, **`room_bill_items`**, **`room_bill_orders`**,
  **`room_furniture`**, **`unit_furniture`**.

### 3.7 `lib/users/`

- `actions.ts` — `fetchUnitUsersAction`/`fetchCapabilityTemplatesAction`
  (reads **`profiles`**, **`capability_templates`**), `inviteUserAction`
  (service-role client: auth admin invite + `profiles` update +
  `user_capabilities` upsert from template), `updateUserAction`,
  `updateUserCapabilitiesAction`, `toggleUserActiveAction`,
  `deleteUserAction`. Service-role paths do explicit role checks — RLS is
  bypassed there.

### 3.8 `lib/api/` — REST API plumbing

`handler.ts` (`withRoute` wrapper + `ok/created/noContent/list` helpers),
`auth.ts` (`requireApiUser`, `requireApiRole`, `requireApiCapability`,
`ApiContext` with both user-scoped and admin clients), `errors.ts`
(`ApiError`, `Errors`), `idempotency.ts` (`Idempotency-Key` replay via
**`idempotency_keys`**), `pagination.ts` (cursor encode/decode),
`rate-limit.ts` (Upstash; no-op without env keys).

### 3.9 `lib/schemas/` — shared Zod schemas

One schema per shape, shared between web forms, server actions, and
`/api/v1/*`: `auth.ts`, `users.ts`, `units.ts`, `items.ts`
(`createProductSchema`, `createVariantSchema`, …), `ration.ts`
(`createScaleSchema`, `upsertScaleItemSchema`, `bulkUpdateScaleItemsSchema`,
rank/terrain enums + labels), `attendance.ts` (incl. `MessType`),
`inventory.ts`, `bar.ts`, `guest-rooms.ts`, `dependants.ts`,
`capabilities.ts`, barrel `index.ts`.

### 3.10 `lib/preferences/`, `lib/utils.ts`

`preferences/cookie.ts` (server-only `readUiPreferences` from the `ui_prefs`
cookie), `preferences/actions.ts` (`setUiPreferenceAction`),
`preferences/modal-style-context.tsx` (dialog vs sheet rendering),
`preferences/types.ts`. `lib/utils.ts` is the shadcn `cn` helper.

---

## 4. Auth & capability model

### Roles and capabilities (`lib/auth/types.ts`)

- **Roles:** `user` | `manager` | `unit_admin` | `admin` (stored on
  `profiles.role`).
- **Capabilities:** the `CAPABILITIES` const — `masters.read/write/
  write.global`, `attendance.read/write/finalize`, `ration.read/issue/adjust`,
  `inventory.read/write`, `bar.read/write/finalize`, `rooms.read/
  booking.write/manage`, `parties.*`, `users.*`, `reports.*`, `billing.*`.
  Granted per-user in **`user_capabilities`** (optionally unit-scoped),
  bundled into **`capability_templates`** (Bar NCO, Mess Havildar, Mess
  Secretary, PMC, Quartermaster, …).
- `AuthUser` carries `role`, `homeUnitId`, `activeUnitId`, `isAllUnits`,
  `capabilities: GrantedCapability[]`.

### Resolution (`lib/auth/get-current-user.ts`)

`getCurrentUser()` (React `cache`d): `supabase.auth.getUser()` →
`profiles` row → `user_capabilities` rows. For `admin`, the active unit comes
from the `active_unit_id` cookie (`ACTIVE_UNIT_COOKIE`; `'all'`/absent =
all-units mode). Non-admins are pinned to `profiles.unit_id`. Only admins may
set the cookie (`app/(app)/_actions/active-unit.ts` calls
`requireRole(['admin'])`).

### Enforcement helpers

- `lib/auth/require-role.ts` — `requireUser()` (redirects to `/sign-in`;
  forces **MFA aal2 for admins**, redirecting to `/mfa/verify` or
  `/mfa/enroll`), `requireRole([...])` (redirects to `/dashboard`).
- `lib/auth/require-capability.ts` — `requireCapability(cap, unitId?)`
  (server-only; redirect on failure).
- `lib/auth/capabilities.ts` — **pure** `userHasCapability` /
  `userHasAnyCapability` (safe in client components; admin → always true,
  unit_admin → true within home unit, else exact grant match with unit
  scoping).

### Three-layer contract (do not skip any layer)

1. **Page** (`app/(app)/**/page.tsx`): exactly one of `requireUser()` /
   `requireRole` / `requireCapability` at the top.
2. **Server action**: capability/role gate as the first statement after
   parsing input. Never rely on RLS alone (silent empty results ≠ 403).
   Service-role paths (`lib/users/actions.ts`) make the gate the only defence.
3. **API route**: `withRoute` + `requireApiUser`/`requireApiCapability`;
   idempotency and rate limiting built in.
4. **DB**: RLS on every table; `app.*` helper functions are
   `SECURITY DEFINER set search_path = ''`. Ration tables are readable with
   `ration.read` or `masters.read`, writable with `ration.adjust(unit_id)`;
   products/variants readable when global (`unit_id is null`) or own-unit.

Audit pattern: `grep -rn "'use server'" lib app | xargs grep -L "requireCapability\|requireRole\|requireUser"` — any hit is a missing gate.

---

## 5. Supabase client patterns (`lib/supabase/`)

| Module | Context | Notes |
|---|---|---|
| `lib/supabase/server.ts` → `createClient()` | Server components, server actions, route handlers | `createServerClient<Database>` from `@supabase/ssr` over `next/headers` cookies; cookie writes are try/caught (read-only RSC contexts — `proxy.ts` performs the actual refresh writes). |
| `lib/supabase/client.ts` → `createClient()` | Client components (`'use client'`) | `createBrowserClient<Database>`. |
| `lib/supabase/service.ts` → `createServiceClient()` | Server-only, sparingly | Service-role key, **bypasses RLS**; used by user invite/management flows. Throws if `SUPABASE_SERVICE_ROLE_KEY` unset. |
| `lib/supabase/middleware.ts` → `updateSession(request)` | Called from `proxy.ts` | Refreshes the session cookie and returns `{ response, user }`. |
| `lib/supabase/index.ts` | — | Barrel: `Database`, `createServerSupabase`, `createBrowserSupabase`. |
| `lib/supabase/database.types.ts` | — | Generated types for the shared schema (post Category/Product/Variant refactor). Each repo's copy is a partial regeneration with app-specific extras (this app has `bar_chits`; admin has `app`-schema functions). Regenerate with `npm run db:types` (local stack) — keep both repos in sync. |

`proxy.ts` (Next 16 Proxy, NOT `middleware.ts`): refreshes cookies on every
matched request, redirects signed-out users to `/sign-in?next=…` except for
`PUBLIC_PATHS` and `/api/*` (API routes do their own auth), and bounces
signed-in users away from `/sign-in`. Optimistic checks only — no business
authorization lives here.

Required env (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`; optional `UPSTASH_REDIS_REST_*`.

---

## 6. Masters vs Ration — the segregation contract

The live DB was refactored (admin migration
`supabase/migrations/20260512080039_products_variants.sql`, commit "Refactor
master items to Category-Product-Variant hierarchy"). The legacy `items`,
`item_versions`, and `pack_sizes` tables and the `set_item_rate` RPC are
**GONE — never reference them**; any `.from('items')` is a runtime crash
("Could not find the table 'public.items' in the schema cache").

### The model

- **Masters (catalogue):** `categories` (tree; seeded roots Alcohol/Cold
  Drinks/Cigars/Snacks/Ration/Grocery = `…000{1..6}`) → `products`
  (`unit_id` null = global catalogue item) → `product_variants`
  (`unit_value` × `unit_type` ML/LITRE/GRAM/KG/PIECE × `package_type`
  BOTTLE/CAN/PACKET/BOX/LOOSE, `sku`, `is_active`).
- **Ration:** `ration_scales` (unique per unit × `rank_class`
  officer/jco/or/civilian × `terrain` plains/desert/high_altitude/field/sea)
  → `ration_scale_item_versions` (SCD-2: one open row per
  (scale_id, **variant_id**); `valid_to IS NULL` = current).
- **Compat views (read-only):**
  - `v_items_current` — legacy items shape, one row per variant;
    `id` **= product_variants.id**; `category` derived from the root category
    name (Snacks → `grocery`); `current_rate` hardcoded `0.00`;
    `security_invoker=on`. Generated TS types mark columns nullable —
    null-filter `id`/`name` after select.
  - `v_masters_search` — flat search/sort/pagination row per variant
    (with `product_fts` tsvector).
  - `v_ration_scale_items_current` — current scale items; its `item_id`
    column **is** `ration_scale_item_versions.variant_id` aliased.

**The universal join key:** `EligibleItem.id` = `MasterRow.id` =
`v_items_current.id` = `v_ration_scale_items_current.item_id` =
`ration_scale_item_versions.variant_id` = **`product_variants.id`**.

### What belongs where

| Concern | Code | Reads | Writes |
|---|---|---|---|
| Masters | `lib/masters/*`, `app/(app)/masters/*` | `v_masters_search` | `products`, `product_variants` |
| Ration | `lib/ration/*`, `app/(app)/ration/*` | `ration_scales`, `ration_scale_item_versions`, `v_ration_scale_items_current` | RPC `set_ration_scale_item`, `ration_scale_item_versions.valid_to` updates, `ration_scales` |

**Writes NEVER target views.**

### Sanctioned cross-links (the ONLY ones — same as the admin app)

1. **ration → masters:** `lib/ration/queries.ts:listEligibleItems` and
   `lib/ration/actions.ts:bulkImportScaleItemsAction` read the catalogue via
   `v_items_current`; `lib/ration/bulk-import.ts` reuses `parseCsv` from
   `lib/masters/bulk-import.ts`.
2. **masters → ration:** `lib/masters/queries.ts:listMasterAuthorisations`
   reads `v_ration_scale_items_current` for the authorisation chips;
   `app/(app)/masters/page.tsx` uses the pure `lib/ration/mess-type.ts`
   helper.
3. **stock → masters:** `lib/stock/queries.ts:listMasterItemsForPicker` reads
   `v_items_current` (item picker).

Do not invent new structure or move files — mirroring the admin reference is
the rule. Avoid `(supabase as any).from(...)` casts: they defeat the generated
types, which is exactly how the dropped-`items` crash survived typechecking.

### Historical incident (June 2026), for context

After the DB refactor, two stale `.from('items')` calls remained here
(`lib/ration/queries.ts` `listEligibleItems` and the bulk-import name lookup
in `lib/ration/actions.ts`), hidden behind `as any` casts. They crashed
`/ration` and `/ration/scales/[id]`; the error *surfaced on `/masters`* only
as a Next 16 dev-overlay cross-request artifact (sidebar `/ration` Link
prefetch pushing the RSC error onto the open page). Fix: both call sites now
read `v_items_current` (ported verbatim from the admin app); no DB changes.

---

## 7. State management

- **Server-first:** pages are async RSCs that fetch via `lib/*/queries.ts`
  and pass plain props down. Mutations are server actions that call
  `revalidatePath(...)` (e.g. `revalidateRation` in `lib/ration/actions.ts`,
  `revalidateMasters` in `lib/masters/actions.ts`).
- **Redux Toolkit** (client, minimal): `lib/redux/store.ts` (`makeStore`,
  single `auth` slice), `lib/redux/auth-slice.ts` (`setAuthUser`,
  `setActiveUnit`), typed hooks in `lib/redux/hooks.ts`,
  `lib/redux/store-provider.tsx`. Hydrated once per request by
  `lib/auth/context.tsx` → `AppContextProvider` (mounted in
  `app/(app)/layout.tsx`); client components read the user via
  `useAppContext()`.
- **Cookies as state:** `active_unit_id` (admin unit switcher, httpOnly:false),
  `ui_prefs` (modal style dialog/sheet), `sidebar_state` (shadcn sidebar).
- **URL searchParams as state:** masters (`?cat&q&inactive&page&sortBy&
  sortOrder`), ration (`?terrain&rank_class`), attendance
  (`?date&view&month`), stock (`?cat`).
- React context only for UI preferences (`ModalStyleProvider`).

---

## 8. Run / dev / typecheck

```bash
npm run dev          # Next.js dev server (default http://localhost:3000)
npm run build        # production build
npm run lint         # eslint
npm test             # vitest run (lib/bar/actions.test.ts, lib/stock/compute.test.ts)
npx tsc --noEmit     # typecheck (no dedicated npm script)

# Local Supabase stack (optional — the app normally points at the hosted project)
npm run db:start | db:stop | db:reset | db:diff
npm run db:types     # regenerate lib/supabase/database.types.ts from LOCAL stack
npm run bootstrap-admin
```

Notes:

- `postinstall` runs `prisma generate` (a `prisma/` dir exists; the data
  layer itself is Supabase-js, not Prisma).
- The hosted project is `lscphcinsukrdaoytbsx` — **the live DB is the source
  of truth; code adapts.** Never run DDL/DML ad hoc; schema changes are new
  files in `supabase/migrations/` (never edit applied ones) and must be
  mirrored into the admin repo (and vice versa — e.g.
  `20260605000000_bar_chits.sql` originated here).
- Read-only live-schema introspection without the dashboard: fetch the
  PostgREST OpenAPI spec from
  `https://lscphcinsukrdaoytbsx.supabase.co/rest/v1/` with the service-role
  key as `apikey` + `Authorization: Bearer`.
- Before writing code, read `AGENTS.md` (Next 16 proxy rename, design-system
  token rules, permissions checklist, known footguns) and
  `docs/design-system.md`. Persistent session memory lives at
  `~/.claude/projects/-Users-pradeepmuthuswamy-Developer-Projects-officers-mess-officers-mess/memory/MEMORY.md`.
