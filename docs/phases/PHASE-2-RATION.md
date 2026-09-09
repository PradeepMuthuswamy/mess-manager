# Phase 2 — Ration: Field Spec & Gap Register

> **Audit date:** 2026-09-09 · **10 parallel agent audits**  
> **Foundation:** [`FOUNDATION.md`](../FOUNDATION.md) · **Master data:** reference catalog implementation — `variant_id` native  
> **Requirements:** [`requirements.md`](../requirements.md) §8 (REQ-RAT-*)

### Document index

| § | Topic | Agent focus |
|---|-------|-------------|
| 0 | Executive summary | All |
| **A** | **Schema field matrices** | Schema, ledger, zod |
| **B** | **Server actions (11)** | Actions |
| **C** | **Queries & reports** | Queries |
| **D** | **Security (SEC-P2)** | RLS, API |
| 1–12 | UI routes, components, gaps | UI, API, cross-phase |

---

## 0. Executive summary

| Area | Built | Gaps |
|------|-------|------|
| **Scale authorisations (REQ-RAT-01)** | ~90% | No master-scale clone UI (REQ-RAT-02); no re-activate flow |
| **Daily consumption (REQ-RAT-03/05)** | ~70% | Post/rollback work; **misleading stock-decrement copy**; draft attendance not blocked |
| **Auto-post (REQ-RAT-04)** | 0% | No `units.auto_ration_post` column, hook, cron, or settings toggle |
| **Stock ledger (REQ-RAT-06)** | ~65% | Receipts/adjustments UI exists; consumption not written as ledger rows; report math wrong for types |
| **Billing policy (REQ-RAT-07/08)** | 0% | No guest tariff UI; members correctly excluded from bill (no UI needed) |
| **Monthly report (REQ-RAT-09)** | 0% | No `/ration/reports/monthly`; no CSV export |
| **REST API** | ~40% | Scales CRUD only; no consumption or stock-transaction routes |
| **Cross-phase: attendance** | Wired | `present_count` read-only from Phase 3 attendance module |

**Phase 2 is shippable after:** ledger-linked post/rollback (P2-RAT-01–03), monthly report + CSV (P2-RPT-01–02), auto-post config (P2-CFG-01–02).

**Phase 2 does NOT block Phase 4 billing** — ration is unit ledger only (REQ-RAT-07).

---

## A. Schema field matrices

**Tables:** `ration_scales`, `ration_scale_item_versions`, `v_ration_scale_items_current`, `ration_stock_transactions`, `ration_consumptions`  
**No separate tables:** `master_ration_scales` → `ration_scales` where `unit_id IS NULL`; `ration_consumption_posts` → `ration_consumptions`

### A.1 `ration_scales`

| Field | SQL type | Null | Default | Zod create | UI | Gap |
|-------|----------|------|---------|------------|-----|-----|
| `id` | uuid | NO | gen_random_uuid() | auto | hidden | — |
| `unit_id` | uuid | **YES** | — | required uuid | New scale | Master scales need null; Zod blocks (P2-G-012) |
| `name` | text | NO | — | min(1) max(120) | Input | — |
| `description` | text | YES | — | max(500) opt | Input | — |
| `rank_class` | `ration_class` enum | NO | officer | enum | Select | officer/jco/or/civilian |
| `terrain` | `ration_terrain` enum | NO | plains | enum | Select | 5 terrains |
| `is_active` | boolean | NO | true | opt | Deactivate | — |

**Unique:** `(unit_id, rank_class, terrain)`; master partial unique on `(rank_class, terrain)` where `unit_id IS NULL`

### A.2 `ration_scale_item_versions` (SCD-2)

| Field | SQL type | Zod | Notes |
|-------|----------|-----|-------|
| `scale_id` | uuid FK | route param | — |
| `variant_id` | uuid FK | `item_id` in schema | Alias in view as `item_id` |
| `auth_qty` | numeric(14,4) | nonnegative | Per diner entitlement |
| `uom` | uom enum | uomSchema | — |
| `notes` | text | max(500) | — |
| `valid_from` / `valid_to` | timestamptz | effective_at | RPC `set_ration_scale_item()` |

### A.3 `ration_stock_transactions`

| Field | SQL type | CHECK | Zod | UI (add-tx dialog) |
|-------|----------|-------|-----|-------------------|
| `variant_id` | uuid | FK | uuid | Item select |
| `transaction_date` | date | — | YYYY-MM-DD | date |
| `type` | text | receipt, adjustment, return_to_source | same enum | Select — **no consumption type** |
| `quantity` | numeric(14,4) | >= 0 | **positive()** | number — **cannot decrease stock** |
| `rate` / `amount` | numeric | >= 0 | nonnegative | auto qty×rate |
| `source` | text | free | max(100) | text — **no canteen/local/govt enum** |

### A.4 `ration_consumptions`

| Field | SQL type | Zod | Gap |
|-------|----------|-----|-----|
| `unit_id` | uuid | uuid | — |
| `consumption_date` | date | YYYY-MM-DD | UNIQUE with unit+variant |
| `variant_id` | uuid | uuid | — |
| `quantity` | numeric(14,4) | nonnegative | **No link to attendance_day_id** (P2-G-007) |
| *(missing)* `attendance_day_id` | — | — | P1 audit |
| *(missing)* `post_source` | — | — | manual \| auto_finalize |
| *(missing)* `present_count` | — | — | snapshot at post |

### A.5 REQ-RAT mapping (schema lens)

| REQ | Status | Blocker |
|-----|--------|---------|
| REQ-RAT-01 Scales SCD-2 | ~90% | — |
| REQ-RAT-02 Master clone | ~40% | No seed/clone RPC |
| REQ-RAT-03 Consumption formula | ~60% | Single rank class for combined mess |
| REQ-RAT-04 Auto-post | 0% | No `units.auto_ration_post` |
| REQ-RAT-05 Manual post/rollback | ~80% | No ledger write |
| REQ-RAT-06 Stock ledger | ~50% | **P2-G-001** consumption→ledger |
| REQ-RAT-07 Not on mess bill | ✅ | By design |
| REQ-RAT-09 Monthly net report | ~25% | No view/query |

---

## B. Server actions (11 exported)

| Action | Capability | Schema | Critical gap |
|--------|------------|--------|--------------|
| `createScaleAction` | ration.adjust | createScaleSchema | — |
| `updateScaleAction` | ration.adjust | updateScaleSchema | — |
| `deleteScaleAction` | ration.adjust | — | Soft deactivate |
| `upsertScaleItemAction` | ration.adjust | upsertScaleItemSchema | RPC |
| `postDailyRationConsumptionAction` | ration.issue \|\| adjust | saveDailyConsumptionSchema | **No stock tx insert (P2-G-001)** |
| `rollbackDailyRationConsumptionAction` | ration.issue \|\| adjust | **none** | No ledger reversal |
| `createRationStockTransactionAction` | ration.adjust | createRationStockTransactionSchema | Manual only |

**Attendance hook:** `finalizeAttendanceAction` has **no ration side-effect** (REQ-RAT-04 gap).

---

## C. Queries

| Function | Returns | Gap |
|----------|---------|-----|
| `getDailyRationConsumption` | auth×present_count vs saved | Combined mess → officer fallback |
| `getRationStockReport` | per-variant balance | `total_returned=0`; all tx types summed as receipts |
| `listRationStockTransactions` | ledger log | No consumption rows |
| *(missing)* `getRationMonthlyNetReport` | — | REQ-RAT-09 |

---

## D. Security (SEC-P2)

| ID | Issue |
|----|-------|
| SEC-P2-01 | API routes lack `requireApiCapability` |
| SEC-P2-06 | Consumption/stock accept arbitrary `variant_id` |
| SEC-P2-07 | No lifecycle guard on post/rollback |

**Positive:** RLS uses `ration.read` / `ration.issue` / `ration.adjust` — stronger than Phase 1 guest rooms SELECT.

---

## 1. Route map & navigation

| Route | Page / component | Capability gate | Write capability |
|-------|------------------|-----------------|------------------|
| `/ration` | `page.tsx` — Authorisations | `ration.read` | `ration.adjust` (scales/items) |
| `/ration/scales/[id]` | `scales/[id]/page.tsx` — Scale detail | `ration.read` (scale unit) | `ration.adjust` |
| `/ration/consumption` | `consumption/page.tsx` | `ration.read` | `ration.issue` **or** `ration.adjust` |
| `/ration/ledger` | `ledger/page.tsx` | `ration.read` | `ration.adjust` (add transaction) |
| `/ration/masters` | `masters/page.tsx` → `MastersView` | `masters.read` | via shared masters (not audited here) |

**Layout:** `layout.tsx` wraps all routes with `RationNav` tabs: Authorisations · Daily Consumption · Stock Ledger · Masters.

**Missing routes (planned, not on disk):**

| Route | REQ | Gap ID |
|-------|-----|--------|
| `/ration/reports/monthly` | REQ-RAT-09 | **P2-G-01** |
| Unit settings: auto-post toggle | REQ-RAT-04, REQ-PLAT-20 | **P2-G-02** |

---

## 2. Component field specs

### 2.1 `RationNav` — `app/(app)/ration/_components/ration-nav.tsx`

| Aspect | Detail |
|--------|--------|
| **DB fields** | None (navigation only) |
| **UI controls** | Link tabs |
| **Validation** | None |
| **Notes** | No Reports tab; masters uses separate capability (`masters.read`) |

---

### 2.2 Authorisations landing — `app/(app)/ration/page.tsx`

**Read-only display (server):**

| Source table / view | Field | UI representation |
|---------------------|-------|-------------------|
| `units` | `name`, `code`, `mess_type`, `terrain` | Header subtitle; drives rank/terrain lock |
| `ration_scales` | `id`, `name`, `rank_class`, `terrain`, `is_active`, `description` | Scale card badges + title |
| `v_ration_scale_items_current` | (via `listScaleItemsCurrent`) | Delegated to `ScaleItemsTable` |
| `ration_scales` (aggregate) | item count per rank class | Badge on rank-class tab links |

**URL query params (read):** `terrain`, `rank_class` — parsed with fallback `plains` / `officer`.

**Logic:** When `units.mess_type` maps to a single rank class (`rankClassForMessType`), rank/terrain selectors are hidden and pinned to unit terrain.

| Control | Type | Required | Client validation |
|---------|------|----------|-------------------|
| Rank class tabs | Link buttons | — | Enum fallback server-side |
| Terrain | `TerrainSwitcher` Select | — | — |
| New scale | `NewScaleDialog` | — | — |

**Capabilities:** Write actions gated by `ration.adjust`.

---

### 2.3 `TerrainSwitcher` — `_components/terrain-switcher.tsx`

| DB field written | UI control | Required | Validation |
|------------------|------------|----------|------------|
| — (URL only) | `Select` (`ration_terrain` enum) | — | Pushes `?terrain=&rank_class=` |

Maps to `ration_scales.terrain` filter context only; does not mutate DB.

---

### 2.4 `NewScaleDialog` — `_components/new-scale-dialog.tsx`

| DB table | Field | UI control | Required | Client validation | Server schema |
|----------|-------|------------|----------|-------------------|---------------|
| `ration_scales` | `unit_id` | hidden input | yes | — | uuid |
| `ration_scales` | `rank_class` | `Select` | yes | enum state | `rationClassSchema` |
| `ration_scales` | `terrain` | `Select` | yes | enum state | `rationTerrainSchema` |
| `ration_scales` | `name` | `Input` (optional display name) | effective yes | maxLength 120; blank → auto name | min(1) max(120) |
| `ration_scales` | `description` | `Textarea` | no | maxLength 500 | max(500) optional |

**Action:** `createScaleAction` → INSERT `ration_scales`. Unique constraint per `(unit_id, rank_class, terrain)` enforced by DB.

---

### 2.5 `EditScaleDialog` — `_components/edit-scale-dialog.tsx`

| DB table | Field | UI control | Required | Client validation | Server schema |
|----------|-------|------------|----------|-------------------|---------------|
| `ration_scales` | `id` | hidden | yes | — | — |
| `ration_scales` | `name` | `Input` | yes | maxLength 120, HTML `required` | min(1) max(120) optional |
| `ration_scales` | `description` | `Textarea` | no | maxLength 500 | max(500) optional |

Does **not** expose `rank_class`, `terrain`, or `is_active` edit.

---

### 2.6 `DeactivateScaleButton` — `_components/deactivate-scale-button.tsx`

| DB table | Field | Effect | UI |
|----------|-------|--------|-----|
| `ration_scales` | `is_active` | SET `false` (soft deactivate) | AlertDialog confirm |

**Misleading copy (P2-G-03):** Dialog says scale "can be re-activated later by an admin" — **no re-activate UI or action exists** in the ration module.

---

### 2.7 `ScaleItemsTable` — `_components/scale-items-table.tsx`

**Display (read):**

| View / table | Fields shown |
|--------------|--------------|
| `v_ration_scale_items_current` | `item_name`, `category`, `auth_qty`, `uom`, `notes`, `sku` |
| `v_items_current` (eligible) | `name`, `category`, `uom` for add combobox |

**Inline edit row (`ScaleItemRow`):**

| DB target | Field | UI control | Required | Client validation | Server |
|-----------|-------|------------|----------|-------------------|--------|
| `ration_scale_item_versions` (via RPC) | `variant_id` | — (row key) | yes | — | uuid |
| RPC `set_ration_scale_item` | `auth_qty` | `Input` number | yes | onBlur: finite, ≥ 0 | nonnegative |
| RPC | `uom` | `Select` (fixed list) | yes | on change | `uomSchema` |
| RPC | `notes` | `Input` text | no | maxLength 500 | max(500) optional |
| RPC | `effective_at` | — | — | defaults now | optional date |

**Add row (`AddItemRow`):**

| Field | UI control | Required | Client validation |
|-------|------------|----------|-------------------|
| `item_id` / `variant_id` | `Combobox` | yes | toast if missing |
| `auth_qty` | `Input` number | yes | finite, ≥ 0 |
| `uom` | `Select` | yes | defaults from item or `kg` |
| `notes` | `Input` | no | maxLength 500 |

**Bulk actions:** checkbox selection → `BulkUpdateDialog`; `BulkImportScaleDialog`; remove → closes open version (`valid_to`).

**Search:** client-side filter on item name / category (no DB field).

---

### 2.8 `BulkImportScaleDialog` — `_components/bulk-import-scale-dialog.tsx`

| Effective DB write | CSV column | UI control | Required | Client validation |
|--------------------|------------|------------|----------|-------------------|
| RPC per row | `item_name` | Textarea CSV paste | yes | `parseBulkImportScale`: header required |
| RPC | `auth_qty` | — | yes | nonnegative number |
| RPC | `uom` | — | yes | `uomSchema` |
| RPC | `notes` | — | no | max 500 |

Preview table validates each row before import; fatal if columns missing.

---

### 2.9 `BulkUpdateDialog` — `_components/bulk-update-dialog.tsx`

| DB via RPC | Field | UI control | Required | Client validation |
|------------|-------|------------|----------|-------------------|
| `auth_qty` (new version) | operation | `Select`: set / multiply / add_percent | yes | — |
| | value | `Input` number | yes | finite; set/multiply ≥ 0 |
| | notes | `Input` | no | maxLength 500 |

Creates new SCD-2 version per selected item via `bulkUpdateScaleItemsAction`.

---

### 2.10 `VersionHistorySheet` — `_components/version-history-sheet.tsx`

| DB table | Fields displayed | UI |
|----------|------------------|-----|
| `ration_scale_item_versions` | `auth_qty`, `uom`, `valid_from`, `valid_to`, `notes`, `created_by` | Read-only timeline modal |

No edit controls. Fetched via `getScaleItemHistoryAction` on open.

---

### 2.11 Scale detail page — `app/(app)/ration/scales/[id]/page.tsx`

Same fields as landing + breadcrumb. Shows `ration_scales.name`, `description`, `is_active`. Embeds `ScaleItemsTable`, `EditScaleDialog`, `DeactivateScaleButton`.

---

### 2.12 Daily consumption page — `app/(app)/ration/consumption/page.tsx`

**Server data (`getDailyRationConsumption`):**

| Source | Fields used | UI |
|--------|-------------|-----|
| `attendance_days` + roster | `status`, derived `present_count` | Passed to form (read-only) |
| `units` | `mess_type`, `terrain` | Select scale dimensions |
| `ration_scales` | active scale for rank×terrain | Drives item list |
| `v_ration_scale_items_current` | `item_id`, `item_name`, `auth_qty`, `uom` | Table columns |
| `ration_consumptions` | `id`, `variant_id`, `quantity` | Posted state / saved qty |

**URL param:** `date` (YYYY-MM-DD), default today.

---

### 2.13 `DateSelector` — `consumption/_components/date-selector.tsx`

| Field | UI control | Required | Validation |
|-------|------------|----------|------------|
| — (URL `date`) | `Input` type=date | — | Navigates only if non-empty |

---

### 2.14 `ConsumptionForm` — `consumption/_components/consumption-form.tsx`

**Display-only fields (computed, not editable):**

| Derived field | Formula / source |
|---------------|------------------|
| Item name, UOM | scale item view |
| Daily scale auth | `auth_qty` |
| Dining strength | `present_count` from attendance |
| Computed consumption | `auth_qty × present_count` |
| Committed consumption | `ration_consumptions.quantity` when posted |

**Actions (write):**

| Action | DB effect | UI control | Client validation |
|--------|-----------|------------|-------------------|
| Post | UPSERT `ration_consumptions` (per variant) | Button "Post Daily Consumption" | `presentCount <= 0` → toast error; button disabled |
| Rollback | DELETE `ration_consumptions` for date | Button "Rollback Post" | `confirm()` dialog |

**Does NOT write** `ration_stock_transactions` (see §5 misleading copy).

**Attendance gating (soft):**

| `attendanceStatus` | UI behaviour | Blocks post? |
|--------------------|--------------|--------------|
| `none` | Destructive alert + link to `/attendance?date=` | No (only `presentCount <= 0`) |
| `draft` | Warning alert + link to attendance | No |
| `finalized` | Success alert with count | No |

**REQ-RAT-03 gap (P2-G-04):** Consumption can be posted while attendance is still draft or missing (0 count blocks only).

---

### 2.15 Stock ledger page — `app/(app)/ration/ledger/page.tsx`

Server loads: `listEligibleItems`, `getRationStockReport`, `listRationStockTransactions` → `LedgerClient`.

---

### 2.16 `LedgerClient` — `ledger/_components/ledger-client.tsx`

**Tab: Stock Summary (read)**

| Report field | Source logic | Column label |
|--------------|--------------|--------------|
| `item_name`, `uom` | eligible items | Item Name, UOM |
| `total_receipts` | sum of **all** `ration_stock_transactions.quantity` | Total Receipts |
| `total_issued` | sum of `ration_consumptions.quantity` | Total Consumed |
| `current_balance` | receipts − consumed (floored at 0) | Current Stock Balance |
| `last_rate` | last tx `rate` seen | Last Purchase Rate |

**Misleading (P2-G-05):** Column "Total Receipts" includes adjustments and returns — not receipts-only. `total_returned` always 0 in query.

**Tab: Transaction Log (read)**

| DB table | Fields shown |
|----------|--------------|
| `ration_stock_transactions` | `transaction_date`, `type`, `quantity`, `rate`, `amount`, `source`, `notes` |
| join | item name via `product_variants → products` |

Consumption rows do **not** appear in transaction log.

---

### 2.17 `AddTransactionDialog` — `ledger/_components/add-transaction-dialog.tsx`

| DB table | Field | UI control | Required | Client validation | Server schema |
|----------|-------|------------|----------|-------------------|---------------|
| `ration_stock_transactions` | `unit_id` | prop | yes | — | uuid |
| | `variant_id` | native `<select>` | yes | toast if empty | uuid |
| | `transaction_date` | `Input` date | yes | HTML required | YYYY-MM-DD regex |
| | `type` | native `<select>` | yes | enum | receipt / adjustment / return_to_source |
| | `quantity` | `Input` number | yes | > 0, toast | positive |
| | `rate` | `Input` number | yes | ≥ 0 | nonnegative |
| | `amount` | `Input` number | yes | ≥ 0; auto qty×rate | nonnegative |
| | `source` | `Input` text | no | — | max(100) optional |
| | `notes` | `Input` text | no | — | max(300) optional |

**Misleading copy (P2-G-06):** Type option labelled **"Adjustment (+/-)"** but schema requires `quantity > 0` — negative adjustments (stock write-down) cannot be recorded via UI.

**Source enum gap (P2-G-07):** REQ-RAT-06 mentions canteen / local / govt issue sources; UI uses free-text `source`, not typed enum.

---

### 2.18 Ration masters — `app/(app)/ration/masters/page.tsx`

Delegates to shared `MastersView` with `allowedSlugs={['ration']}`. Manages `items` / `item_versions` catalogue (ration category), not ration ledger tables. Gate: `masters.read`.

---

## 3. REQ-RAT-* coverage matrix

| Requirement | Description | UI coverage | Status | Gap IDs |
|-------------|-------------|-------------|--------|---------|
| **REQ-RAT-01** | Govt ration scales per rank × terrain, SCD-2 history | Full: create/edit/deactivate scales; inline item auth; bulk import/update; version history sheet | **Mostly met** | P2-G-03 (no re-activate) |
| **REQ-RAT-02** | Platform master scales; clone on onboarding | Scales are unit-scoped only; no clone/import-from-master UI | **Not built** | **P2-G-08** (deferred Phase 5 per plan) |
| **REQ-RAT-03** | Daily consumption = auth × present diner count | Computed display + post; count from finalized attendance data | **Partial** | P2-G-04 (draft/not blocked) |
| **REQ-RAT-04** | Auto-post when attendance finalized (configurable) | No toggle, hook, or cron UI | **Not built** | **P2-G-02** |
| **REQ-RAT-05** | Manual post/rollback by Mess Havildar | Post + Rollback buttons on consumption page | **Met** | P2-G-09 (copy/stock linkage) |
| **REQ-RAT-06** | Stock ledger: receipts, adjustments, returns; consumption decrements balance | Add transaction dialog; summary balance; consumption affects balance only via separate table math | **Partial** | P2-G-05, P2-G-06, P2-G-07, **P2-G-09** |
| **REQ-RAT-07** | Members not charged on mess bill | No ration charge UI (correct — mess fund) | **N/A (policy)** | — |
| **REQ-RAT-08** | Guest meal tariffs | No UI | **Not built** | **P2-G-10** (deferred) |
| **REQ-RAT-09** | Monthly net report + export | No report route; no CSV export anywhere in ration module | **Not built** | **P2-G-01** |

---

## 4. UI coverage matrix (pages × capabilities)

| Page / component | Read fields | Write fields | Controls used | Required fields | Client validation | REQ mapping |
|------------------|-------------|--------------|---------------|-----------------|-------------------|-------------|
| `/ration` | scales, items, unit meta | — (dialogs) | Links, Select, Dialog | — | URL enum parse | RAT-01 |
| `NewScaleDialog` | — | scale header | Select, Input, Textarea | rank, terrain, name (auto) | maxLength | RAT-01 |
| `EditScaleDialog` | name, desc | name, desc | Input, Textarea | name | maxLength, required | RAT-01 |
| `ScaleItemsTable` | item auth rows | auth_qty, uom, notes | Input, Select, Combobox | item, qty | ≥0, toast | RAT-01 |
| `BulkImportScaleDialog` | — | auth rows | Textarea | CSV columns | row parser | RAT-01 |
| `BulkUpdateDialog` | — | auth_qty versions | Select, Input | value | numeric rules | RAT-01 |
| `VersionHistorySheet` | version rows | — | — | — | — | RAT-01 |
| `/ration/consumption` | attendance, consumptions | — | date Input | — | date regex (server) | RAT-03 |
| `ConsumptionForm` | computed qty | consumptions | Button | — | presentCount > 0 | RAT-03, RAT-05 |
| `/ration/ledger` | report, txs | — | tabs | — | — | RAT-06 |
| `AddTransactionDialog` | — | stock tx | select, Input, date | item, date, qty, rate, amount | positive qty | RAT-06 |
| `/ration/masters` | items catalogue | item rates | shared masters | per masters | per masters | INV (support) |

---

## 5. Misleading or inaccurate copy

| Location | Copy | Reality | Gap ID |
|----------|------|---------|--------|
| `consumption-form.tsx` L62 | "Ration consumption posted and **stock decremented** successfully." | `postDailyRationConsumptionAction` only UPSERTs `ration_consumptions`; no `ration_stock_transactions` insert | **P2-G-09** |
| `consumption-form.tsx` L82 | "rolled back and **stock restored**" | Deletes consumption rows only; no ledger reversal | **P2-G-09** |
| `consumption-form.tsx` L95–97 | "**Stock Ledger Posted** … Stock quantities have been **decremented**" | Balance changes only in computed report (`getRationStockReport`), not as ledger entries | **P2-G-09** |
| `ledger-client.tsx` L79 | "**Total Receipts**" | Sums all transaction types (receipt + adjustment + return) | **P2-G-05** |
| `add-transaction-dialog.tsx` L164 | "**Adjustment (+/-)**" | DB + schema require quantity > 0; no sign semantics | **P2-G-06** |
| `deactivate-scale-button.tsx` L66–67 | "can be **re-activated** later by an admin" | No re-activate action in UI | **P2-G-03** |
| `consumption/page.tsx` subtitle | "Track and **commit** daily unit ration consumption" | Commit = consumption table only, not full ledger post per plan P2-RAT-01 | **P2-G-09** |

---

## 6. Cross-phase overlaps

### 6.1 Attendance → Ration (Phase 3 module, consumed by Phase 2)

```
/attendance                          /ration/consumption
     │                                        │
     ▼                                        ▼
attendance_days.status              getDailyRationConsumption()
attendance_absences (roster)   →    present_count (read-only)
     │                                        │
     └─ finalizeAttendanceAction ────────────┘ (manual post only today;
                                                 no auto hook — P2-G-02)
```

| Shared concept | Attendance UI | Ration UI | Single source of truth |
|----------------|---------------|-----------|------------------------|
| Dining strength | `AttendanceRoster` — toggles per member; displays `presentCount` | `ConsumptionForm` — shows `presentCount`, no edit | `getAttendanceDay().present_count` |
| Day status | draft / finalized badges; finalize button | Alerts linking to `/attendance?date=` | `attendance_days.status` |
| Date navigation | date input + prev/next | `DateSelector` | URL `?date=` |

**Phase 3 note:** Kitchen/messing modules will also consume diner count for meal planning — same `present_count`; ration must not duplicate an editable count field (currently correct: read-only).

**Risk (P2-G-04):** Ration post allowed when attendance is `draft` or `none` (if count > 0 from default-all-present roster behaviour).

### 6.2 Masters / inventory

- Scale items reference `product_variants` / `v_items_current` (ration + grocery categories).
- Stock transactions also reference `variant_id`.
- Bar/inventory lots (REQ-INV-*) are separate ledger — not surfaced in ration UI (by design, REQ-INV-05).

### 6.3 Billing (Phase 4)

- REQ-RAT-07: no ration lines on mess bill — no UI in ration module (expected).
- REQ-RAT-08 guest tariffs: would live in messing/billing; not in ration UI.

---

## 7. Missing features (explicit)

| Feature | REQ / plan task | Status | Gap ID |
|---------|-----------------|--------|--------|
| Monthly net report page | REQ-RAT-09, P2-RPT-01 | No route `/ration/reports/monthly` | **P2-G-01** |
| CSV export (report or ledger) | REQ-RAT-09, P2-RPT-02 | No export button or download action | **P2-G-01** |
| Auto-post unit toggle | REQ-RAT-04, P2-CFG-01 | No `units.auto_ration_post` migration or Settings UI | **P2-G-02** |
| Auto-post on finalize hook | REQ-RAT-04, P2-CFG-02 | `finalizeAttendanceAction` has no ration side-effect | **P2-G-02** |
| Nightly cron / notifications | REQ-PLAT-20, P2-CRON-01 | Not built | **P2-G-02** |
| Consumption → ledger RPC | P2-RAT-01 | Post does not insert stock transactions | **P2-G-09** |
| Rollback → reverse ledger | P2-RAT-02 | Not built | **P2-G-09** |
| `total_returned` in report | P2-RAT-04 | Hardcoded 0 in query | **P2-G-05** |
| Master scale clone | REQ-RAT-02 | Deferred Phase 5 | **P2-G-08** |
| Guest ration tariffs | REQ-RAT-08 | Deferred | **P2-G-10** |
| REST: consumption API | P2-API-01 | Only scales routes under `/api/v1/ration/scales/*` | **P2-G-11** |
| REST: stock transactions API | P2-API-02 | Not built | **P2-G-11** |
| Reactivate scale UI | — | Soft delete only | **P2-G-03** |
| Typed receipt source (canteen/local/govt) | REQ-RAT-06 | Free text only | **P2-G-07** |

---

## 8. Gap register (P2-G-xxx)

| ID | Severity | Summary | Suggested fix |
|----|----------|---------|---------------|
| **P2-G-01** | High | No monthly report page or CSV export | Add `/ration/reports/monthly` + export action (P2-RPT-01/02) |
| **P2-G-02** | High | No auto-post config or automation | Migration `auto_ration_post`; Settings toggle; hook on finalize |
| **P2-G-03** | Low | Deactivate copy promises re-activate | Add re-activate button or fix copy |
| **P2-G-04** | Medium | Post allowed with draft/missing attendance | Block post unless `status === 'finalized'` (server + UI) |
| **P2-G-05** | Medium | Stock summary mislabels aggregates | Split by tx type; implement `total_returned` |
| **P2-G-06** | Medium | Adjustment (+/-) cannot reduce stock | Support signed adjustments or separate "issue" type |
| **P2-G-07** | Low | Receipt source is free text | Enum select: canteen / local / govt issue |
| **P2-G-08** | Low | No master scale clone UI | Phase 5 onboarding RPC + admin action |
| **P2-G-09** | **Critical** | UI claims stock ledger updated on post; it is not | Implement P2-RAT-01/02/03; fix toasts and alerts |
| **P2-G-10** | Low | Guest ration charging | Phase 2 deferred; messing/billing policy UI |
| **P2-G-11** | Medium | No REST for consumption/stock tx | P2-API-01/02 |

---

## 9. Server action ↔ UI contract notes

| Action | Called from | Writes | Revalidates |
|--------|-------------|--------|-------------|
| `createScaleAction` | NewScaleDialog | `ration_scales` | `/ration` |
| `updateScaleAction` | EditScaleDialog | `ration_scales` | `/ration`, scale page |
| `deleteScaleAction` | DeactivateScaleButton | `is_active=false` | `/ration` |
| `upsertScaleItemAction` | ScaleItemsTable | RPC → versions | scale paths |
| `bulkImportScaleItemsAction` | BulkImportScaleDialog | RPC × N | scale paths |
| `bulkUpdateScaleItemsAction` | BulkUpdateDialog | RPC × N | scale paths |
| `postDailyRationConsumptionAction` | ConsumptionForm | `ration_consumptions` only | `/ration` |
| `rollbackDailyRationConsumptionAction` | ConsumptionForm | DELETE consumptions | `/ration` |
| `createRationStockTransactionAction` | AddTransactionDialog | `ration_stock_transactions` | `/ration` |

**Bug:** `postDailyRationConsumptionAction` revalidates `/ration` but not `/ration/consumption` or `/ration/ledger` — stale ledger until manual refresh (minor).

---

## 10. Design-system violations (informational)

Several ration components use raw palette classes banned by AGENTS.md (`border-emerald-500`, `text-amber-600`, `bg-sky-500/5`, etc.) in `consumption-form.tsx` and `ledger-client.tsx`. Prefer semantic tokens (`text-primary`, `bg-destructive/10`, etc.).

---

## 11. Phase 2 definition of done (from plan) — checklist

| Criterion | Current |
|-----------|---------|
| Posting consumption updates ledger balance per item | ❌ P2-G-09 |
| One week live with auto-post after finalize | ❌ P2-G-02 |
| Monthly report exported | ❌ P2-G-01 |
| Food Member read-only report view | ❌ P2-G-01 |

---

## 12. File inventory (audited)

```
app/(app)/ration/
├── layout.tsx
├── page.tsx
├── _components/
│   ├── bulk-import-scale-dialog.tsx
│   ├── bulk-update-dialog.tsx
│   ├── deactivate-scale-button.tsx
│   ├── edit-scale-dialog.tsx
│   ├── new-scale-dialog.tsx
│   ├── ration-nav.tsx
│   ├── scale-items-table.tsx
│   ├── terrain-switcher.tsx
│   └── version-history-sheet.tsx
├── consumption/
│   ├── page.tsx
│   └── _components/
│       ├── consumption-form.tsx
│       └── date-selector.tsx
├── ledger/
│   ├── page.tsx
│   └── _components/
│       ├── add-transaction-dialog.tsx
│       └── ledger-client.tsx
├── masters/page.tsx
└── scales/[id]/page.tsx
```

**Supporting (referenced, not UI):** `lib/ration/{actions,queries,types,bulk-import,mess-type}.ts`, `lib/schemas/ration.ts`, `lib/attendance/queries.ts` (`getAttendanceDay`).
