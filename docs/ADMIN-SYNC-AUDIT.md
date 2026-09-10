# ADMIN ↔ OPS Sync Audit

> **Date:** 2026-09-10 · **10 parallel read-only audits**  
> **OPS (source of truth):** `mess-manager` · **ADMIN (must sync):** `mess-admin`  
> **Hosted DB:** CommandHQ Mess · `nwrjhxzlnvtubwjuzsxr`  
> **Requirements:** [`requirements.md`](./requirements.md) · **Architecture:** [`FOUNDATION.md`](./FOUNDATION.md) · **Schema contract:** [`SHARED-DATA-MODEL.md`](./SHARED-DATA-MODEL.md)

---

## 0. Executive verdict

ADMIN is a **pre–Phase 0 snapshot** of a shared-DB sibling. Shared migrations that exist in both repos are byte-identical — the problem is **ADMIN is 14 files behind**, and its **runtime still writes `products.unit_id`**, a column the live catalog reset dropped.

| Layer | Verdict |
|-------|---------|
| **Shared migrations (46 common files)** | Byte-identical |
| **ADMIN migration folder** | 46 vs OPS 60 — missing June–Sept 2026 schema |
| **ADMIN catalog / masters** | **Will crash on live CommandHQ** (`products.unit_id` INSERT/SELECT) |
| **ADMIN types** | Hand-patched / stale — no `unit_catalog`, `unit_menu_rates`, folio, messing ops tables |
| **ADMIN docs** | Retired project ref `lscphcinsukrdaoytbsx`; no `requirements.md` / `FOUNDATION.md` / `phases/` |
| **Auth contract** | Core plumbing aligned; bootstrap still writes invalid `admin` role; incomplete ops-role bounce |
| **Ops surfaces in ADMIN** | Stale guest-rooms lib, orphaned `/ration` consumption/ledger, inventory API — should not live here |
| **Correct ADMIN surfaces** | Units, global masters, capability templates, super-admin users, Settings tariff config, MFA |

**Do not** copy the two OPS bootstrap one-offs (`20260909193233`, `20260910012552`). **Do not** re-apply `20260909183414_catalog_foundation_reset.sql` to populated CommandHQ (TRUNCATE + product purge).

---

## 1. Priority actions

### P0 — live-schema / auth breakage

| # | Action | Repo | Why |
|---|--------|------|-----|
| 1 | Copy **12 schema migrations** from OPS → ADMIN (see §2). Skip the two bootstrap one-offs. Optionally copy `20260612125800` for history. | ADMIN | Shared-DB contract; ADMIN `db:reset` is otherwise a different schema |
| 2 | `npm run db:types` in **both** repos after apply. Do not hand-patch types. | Both | ADMIN types omit Phase 0–4 tables; still have `products.unit_id` |
| 3 | Strip `products.unit_id` from ADMIN masters + `/api/v1/items` (create/update/bulk/GET-by-id). Global catalog only; `masters.write.global` for all product writes. | ADMIN | **Crashes on live** — column dropped by `20260909183414` |
| 4 | Fix ADMIN `scripts/bootstrap-admin.ts`: `'admin'` → `'super_admin'`. | ADMIN | Enum rename; bootstrap is invalid |
| 5 | Fix OPS `20260909183414` AAL2 policies: `'admin'` → `'super_admin'` **before** relying on them for `unit_catalog` / `unit_menu_rates`. | OPS | `super_admin` writes would **not** require AAL2 |

### P1 — contract + segregation

| # | Action | Repo |
|---|--------|------|
| 6 | Replace ADMIN `docs/SHARED-DATA-MODEL.md` with OPS copy. Copy `requirements.md`, `FOUNDATION.md`, `docs/README.md`, entire `docs/phases/`. | ADMIN |
| 7 | Rewrite ADMIN `AGENTS.md`: CommandHQ ref, `super_admin`, app segregation, `NEXT_PUBLIC_OPS_APP_URL`, pointer to requirements/FOUNDATION. | ADMIN |
| 8 | Expand ADMIN sign-in / confirm bounce to **all ops-only roles** (not just `user`/`manager`). Align API allow-list and invite `baseUrl` (`mess_secretary` → OPS). | ADMIN |
| 9 | Add `NEXT_PUBLIC_OPS_APP_URL` to ADMIN `.env.local.example`. Production: `SITE_URL=https://admin.mess-manager.com`, `OPS_APP_URL=https://mess-manager.com`. | ADMIN |
| 10 | Delete or freeze ADMIN `lib/guest-rooms/*` and orphaned `/ration/consumption` + `/ration/ledger` + `/api/v1/inventory`. | ADMIN |
| 11 | Archive ADMIN `docs/superpowers/specs/2026-05-17-room-types-master-design.md` (superseded by static `rooms.room_type`). Rewrite or retire `KNOWLEDGE.md`. | ADMIN |
| 12 | Update OPS `AGENTS.md` + `requirements.md` §15: `/messing` and `/billing` are **not** placeholders. | OPS |

### P2 — product gaps (correct owner, not yet built)

| # | Action | Owner |
|---|--------|-------|
| 13 | Master ration-scale console (`unit_id IS NULL`) + clone on unit create | ADMIN (REQ-RAT-02, REQ-PLAT-10) |
| 14 | Provisioning wizard: unit → clone scale → seed appointments → invite first unit admin | ADMIN |
| 15 | `enabled_modules` / REQ-PLAT-04 | ADMIN |
| 16 | Appointments model + committee minutes | Shared schema; OPS UI |
| 17 | Parties, reports, comms | OPS first; ADMIN gets REQ-RPT-02 later |
| 18 | Enable `app.custom_access_token_hook` in CommandHQ Dashboard | Shared infra |

---

## 2. Migration copy list (ADMIN)

Copy in timestamp order from `mess-manager/supabase/migrations/`:

1. `20260612000000_ration_usage.sql`
2. `20260612010000_ration_consumption.sql`
3. `20260612124217_booking_guest_contact.sql`
4. `20260612130423_recent_auth_events_fn.sql` — ADMIN code already calls this
5. `20260612143450_fk_and_hotpath_indexes.sql`
6. `20260613000000_messing_billing_flat_rates.sql`
7. `20260614000000_messing_kitchen_and_monthly_billing.sql`
8. `20260615000000_guest_rooms_saas_enhancements.sql`
9. `20260909183414_catalog_foundation_reset.sql` — **parity only; do not re-apply on prod**
10. `20260909183418_guest_rooms_folio_and_tariffs.sql`
11. `20260909183421_ration_ledger_foundation.sql`

**Optional:** `20260612125800_aal2_admin_write_enforcement.sql` (superseded on remote by `20260612150000_simplify_roles.sql`).

**Do not copy:** `20260909193233_confirm_bootstrap_admin_and_seed_units.sql`, `20260910012552_promote_ops_unit_admin_5mad.sql`.

---

## 3. Ownership matrix (what ADMIN may keep)

| Domain | ADMIN | OPS |
|--------|-------|-----|
| Global catalog (`categories`, `products`, `product_variants`) | **R/W** (global only) | R + `unit_catalog` adopt + `unit_menu_rates` |
| Units create / deactivate | **R/W** | — |
| Unit runtime config (billing mode, flat rates, guest food, auto-ration) | Settings: mode + flat rates today | **Primary** — also `guest_food_per_night`, `auto_ration_post` |
| Capability templates | **R/W** | R (apply to users) |
| Cross-unit user invite / password reset | **R/W** | Unit-scoped `/users` |
| Dependants roster | **R/W** today | R |
| MFA / AAL2 for `super_admin` | **Only here** | Bounce `super_admin` to admin console |
| Guest-room bookings, folio, bar→folio, checkout | — | **All REQ-GR-*** |
| Daily ration consumption / ledger / auto-post | — | **REQ-RAT-03..06** |
| Master ration scales + clone on onboard | **Should own** (missing) | Unit-scale edits |
| Kitchen / meal cuts / P-rate / monthly bills | Settings tariffs only | **REQ-MES-*** / **REQ-BIL-*** |
| Bar selling / stock lots | Catalog only | **REQ-BAR / REQ-INV** |
| Parties / unit reports / comms | Cross-unit reports later | Primary |

---

## 4. Per-slice findings

### 4.1 Docs contract

ADMIN is missing the entire requirements stack (`requirements.md`, `FOUNDATION.md`, `README.md`, `phases/*`). `SHARED-DATA-MODEL.md` is **not** byte-identical (261 vs 293 lines): retired project ref, still documents `products.unit_id`, no `unit_catalog` / `unit_menu_rates`. `design-system.md` is already identical. `AGENTS.md` must stay forked (app-specific) but import CommandHQ + Phase 0 facts.

### 4.2 Migrations

ADMIN 46 = clean prefix of OPS 60. All 46 shared files SHA256-match. Drift is entirely OPS-only work after `20260612150000_simplify_roles.sql`. Highest impact: Sept catalog trilogy + June messing / guest-rooms / ration.

### 4.3 Global catalog (REQ-MD)

ADMIN `/masters` still treats products as unit-scoped. Create/update/bulk-import and `POST/PATCH /api/v1/items` write `products.unit_id`. No `name_normalized`. Capability split (`masters.write` vs `write.global`) is keyed on the dropped column. Categories are read-only. Bulk import requires `rate` then drops it. `v_masters_search.product_unit_id` filter is meaningless post-reset.

### 4.4 Platform / units (REQ-PLAT)

Unit CRUD exists (super_admin). No provisioning wizard (REQ-PLAT-10/11), no `enabled_modules` (REQ-PLAT-04), no bill formats (REQ-CFG). ADMIN Settings has billing mode + flat rates; **missing** `guest_food_per_night` and `auto_ration_post` that OPS Settings already has. `mess_type` / `terrain` are editable in both apps.

### 4.5 Auth / MFA / segregation

Aligned: `super_admin` enum + Zod preprocess, `handle_new_user`, `token_hash` links, flow-gate, inverse bounce codes, MFA correctly ADMIN-only. Broken: ADMIN bootstrap writes `admin`; sign-in only blocks `user`/`manager`; `mess_secretary` allowed on API but blocked on web; invite API keeps secretary on ADMIN URL; docs still cite retired Supabase project. OPS `resend.ts` + invite API still label `'admin'`.

### 4.6 Users / capabilities / governance

ADMIN correctly owns `/admin/users` + `/admin/capabilities`. `/users` in ADMIN is a dependants roster (role-gated); OPS `/users` is the capability-gated unit surface. Appointments (§3) and committee minutes (REQ-MCM) are **unbuilt in both** — only `FUNCTIONAL_ROLES` checkboxes that flatten to `user_capabilities`. No `appointments` table.

### 4.7 Guest rooms / tariffs

**No REQ-GR operational IDs belong in ADMIN.** Stale unwired `lib/guest-rooms/` predates folio/bar/`transferred_to_mess_bill`/UNIQUE `booking_id`. Room types are a static enum on `rooms`, not a catalog master. Optional `guest_food_per_night` at unit provision is ADMIN-adjacent; runtime editor is OPS Settings.

### 4.8 Ration

ADMIN owns master scales + clone-on-onboard — **neither is built**. `/ration` in ADMIN is an OPS mirror (consumption + ledger) orphaned from `NAV_ADMIN`. Masters `?cat=ration` catalog is aligned. `auto_ration_post` is OPS-owned and correctly absent from ADMIN Settings, but ADMIN lacks the migration/types.

### 4.9 Messing / kitchen / billing

OPS `/messing` and `/billing` are real (~55% / ~75%). ADMIN correctly has **no** those routes. Settings flat-rate UI after commit `f51d0fc` is aligned — but the `20260613000000` migration was never copied, and types omit all Phase 3/4 ops tables. ADMIN docs still call Settings “mess_type/terrain only” and list `/billing` as a platform placeholder.

### 4.10 Bar / inventory / parties / reports / comms

ADMIN must not sell bar (correctly has no `/bar` code) but nav still links to 404s. Inventory API + `lib/inventory` are the **wrong owner**. Parties/reports/comms unbuilt on both sides. Catalog crash paths listed in §1 #3.

**ADMIN files that crash on live `products.unit_id`:**

- `lib/masters/actions.ts`
- `app/api/v1/items/route.ts`
- `app/api/v1/items/[id]/route.ts`

Plus schema/UI: `lib/schemas/items.ts`, `lib/masters/{types,queries}.ts`, `lib/supabase/database.types.ts`, masters form/table/bulk/multi-edit dialogs.

---

## 5. OPS-only doc drift (fix while syncing)

These are not ADMIN bugs but they mislead both apps:

| Doc | Stale claim | Reality |
|-----|-------------|---------|
| OPS `AGENTS.md` | `/messing`, `/billing` placeholder; `/admin/*` pages exist | Real messing/billing; admin UI lives in `mess-admin` |
| OPS `requirements.md` §15 | Monthly bill “UI mock” | Phase 4 UI ~75% |
| OPS `AGENTS.md` masters | still mentions `item_versions` / `set_item_rate` | Dropped in Phase 0 |
| OPS `PHASE-1-GUEST-ROOMS.md` §9 | `syncBarChitsToRoomBillAction` missing | Implemented; `20260909183418` shipped |
| OPS `lib/email/resend.ts` + `api/admin/invite-user` | role label `'admin'` | Must be `super_admin` |
| Both `SHARED-DATA-MODEL.md` | “42 migrations” | OPS 60 / ADMIN 46 |

---

## 6. Suggested implementation order

1. **Schema parity** — copy 12 migrations; regenerate types; fix OPS AAL2 `'admin'` string.
2. **Unbreak masters** — global-only catalog; strip `unit_id`; seed.sql for `name_normalized`.
3. **Auth contract** — bootstrap, bounce gates, invite URLs, env/docs CommandHQ refs.
4. **Delete dead ADMIN ops layers** — guest-rooms lib, ration consumption/ledger, inventory API, stale NAV_OPS links.
5. **Doc contract** — copy OPS docs; fork-update ADMIN `AGENTS.md`; archive `superpowers/` + rewrite `KNOWLEDGE.md`.
6. **Then** build missing ADMIN-owned product: master ration scales + clone-on-provision.

---

## 7. Agent index

| # | Slice | Status |
|---|-------|--------|
| 1 | Documentation contract | Done |
| 2 | Migration / schema drift | Done |
| 3 | Global catalog / masters | Done |
| 4 | Platform, units, onboarding | Done |
| 5 | Auth, roles, MFA, segregation | Done |
| 6 | Users, capabilities, governance | Done |
| 7 | Guest rooms + tariffs | Done |
| 8 | Ration + ledger | Done |
| 9 | Messing, kitchen, monthly billing | Done |
| 10 | Bar, inventory, parties, reports, comms, APIs | Done |
