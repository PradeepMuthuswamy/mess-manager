# SHARED DATA MODEL — Officers' Mess

> **Single source of truth for the shared Supabase schema.**
> An IDENTICAL copy of this file lives in BOTH repos:
> - `officers-mess/docs/SHARED-DATA-MODEL.md` (USER app)
> - `officer-mess-admin/docs/SHARED-DATA-MODEL.md` (ADMIN app)
>
> If you edit one copy, you MUST edit the other so they stay byte-identical.

## 1. Ground rules

Both Next.js apps point at **one hosted Supabase project**: `Mess Manager` (ref `lscphcinsukrdaoytbsx`), schema `public`.

1. **The live database is the source of truth. Code adapts to the DB, never the other way round** (no app may "fix" itself by changing the schema unilaterally).
2. **Migrations live in BOTH repos, byte-identical**, under `supabase/migrations/`. The same 42 files (`20260512080001_init.sql` … `20260605000000_bar_chits.sql`) must exist in both. A migration added in one repo is copied verbatim into the other.
3. **Writes never target views.** Views (`v_*`) are read-only projections; mutations go to base tables or RPCs.
4. **Never cast the Supabase client to `any` to silence a missing-relation type error.** That is exactly how the `items` regression shipped: stale `.from('items')` calls hidden behind `(supabase as any)` crashed at runtime with *"Could not find the table 'public.items' in the schema cache"*.

### Dropped relations — never reference these

The migration `20260512080039_products_variants.sql` ("Refactor master items to Category-Product-Variant hierarchy") **DROPPED**:

- tables `items`, `item_versions`, `pack_sizes`
- RPC `set_item_rate`

Any `.from('items')` (or the others above) is an immediate runtime crash. Legacy-shaped reads go through the compat view `v_items_current` instead (see §4).

## 2. Enums

| Enum | Values | Notes |
|---|---|---|
| `uom` | `kg` `g` `l` `ml` `piece` `pack` `bottle` | Legacy unit-of-measure; still the live type on ration quantities. |
| `item_category` | `ration` `soft_drink` `alcohol` `cigar` `grocery` `room` | Legacy; appears **only** in compat views, derived from the root category name (§4). |
| `unit_type` | `ML` `LITRE` `GRAM` `KG` `PIECE` | New variant sizing unit. |
| `package_type` | `BOTTLE` `CAN` `PACKET` `BOX` `LOOSE` | New variant packaging. |
| `ration_class` | `officer` `jco` `or` `civilian` | Ration scale rank dimension. |
| `ration_terrain` | `plains` `desert` `high_altitude` `field` `sea` | Ration scale terrain dimension. |

## 3. Masters & ration tables

### 3.1 Masters catalog: `categories` → `products` → `product_variants`

#### `categories`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | NOT NULL |
| `parent_id` | uuid | nullable, FK → `categories.id` (self-referencing tree) |
| `created_at`, `updated_at` | timestamptz | NOT NULL |

Seeded root categories (fixed UUIDs, prefix `00000000-0000-0000-0000-00000000000N`):
Alcohol=`…0001`, Cold Drinks=`…0002`, Cigars=`…0003`, Snacks=`…0004`, Ration=`…0005`, Grocery=`…0006`.

#### `products`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | nullable, FK → `units.id` — **null = global catalog item** |
| `category_id` | uuid | NOT NULL, FK → `categories.id` |
| `name` | text | NOT NULL |
| `description` | text | nullable |
| `is_active` | boolean | NOT NULL |
| `fts` | tsvector | **GENERATED — never insert/update this column** |
| `created_at`, `updated_at` | timestamptz | NOT NULL |
| `created_by`, `updated_by` | uuid | nullable |

Unique: `(unit_id, category_id, name)`.

#### `product_variants`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK — **this is THE item id everywhere** (see §5 join keys) |
| `product_id` | uuid | NOT NULL, FK → `products.id` ON DELETE CASCADE |
| `unit_value` | numeric(12,3) | NOT NULL |
| `unit_type` | enum `unit_type` | NOT NULL |
| `package_type` | enum `package_type` | NOT NULL |
| `sku` | text | nullable |
| `is_active` | boolean | NOT NULL |
| `created_at`, `updated_at` | timestamptz | NOT NULL |
| `created_by`, `updated_by` | uuid | nullable |

Unique: `(product_id, unit_value, unit_type, package_type)`.

### 3.2 Ration: `ration_scales` → `ration_scale_item_versions`

#### `ration_scales`
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `unit_id` | uuid | NOT NULL, FK → `units.id` |
| `name` | text | NOT NULL |
| `description` | text | nullable |
| `is_active` | boolean | NOT NULL |
| `rank_class` | enum `ration_class` | NOT NULL |
| `terrain` | enum `ration_terrain` | NOT NULL |
| `created_at`, `updated_at` | timestamptz | NOT NULL |
| `created_by`, `updated_by` | uuid | nullable |

Unique: `(unit_id, rank_class, terrain)` — one scale per unit/rank/terrain combination.

#### `ration_scale_item_versions` (SCD-2 history table)
| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK (= `version_id` in the current-view) |
| `scale_id` | uuid | NOT NULL, FK → `ration_scales.id` ON DELETE CASCADE |
| `variant_id` | uuid | NOT NULL, FK → `product_variants.id` — **RENAMED from `item_id`** in the products refactor |
| `auth_qty` | numeric(14,4) | NOT NULL, >= 0 |
| `uom` | enum `uom` | NOT NULL |
| `notes` | text | nullable |
| `valid_from` | timestamptz | NOT NULL, default `now()` |
| `valid_to` | timestamptz | nullable — **null = current row** |
| `created_at` | timestamptz | NOT NULL |
| `created_by` | uuid | nullable |

Invariant: at most **one open row** (`valid_to IS NULL`) per `(scale_id, variant_id)`.

## 4. Views (all SELECT-granted to `authenticated`; never write to them)

### `v_items_current` — legacy-items compatibility view
One row per **variant**, presented in the shape of the dropped `items` table. Use this for any code that still thinks in "items".

| Column | Meaning |
|---|---|
| `id` | = `product_variants.id` — **a VARIANT id**, not a product id |
| `unit_id` | = `products.unit_id` (null = global) |
| `category` | `item_category` derived from ROOT category name: Alcohol→`alcohol`, Cold Drinks→`soft_drink`, Cigars→`cigar`, Snacks→`grocery`, Ration→`ration`, Grocery→`grocery`, anything else→`grocery` |
| `name` | = `products.name` |
| `sku` | = variant sku |
| `uom` | mapped from `unit_type`: ML→`ml`, LITRE→`l`, GRAM→`g`, KG→`kg`, PIECE→`piece` |
| `is_active` | = variant `is_active` |
| `created_at` / `updated_at` / `created_by` / `updated_by` | variant audit columns |
| `pack_size_id` | always **null** (pack_sizes is gone) |
| `version_id` | = variant id (legacy shape filler) |
| `current_rate` | hardcoded `0.00` (rates left the masters domain) |
| `current_ration_scale` | null |
| `rate_valid_from` | timestamptz |
| `version_notes` | null |
| `pack_label` | display label, e.g. "750 ml Bottle" |
| `pack_kind` | `'volume'` or `'count'` |
| `volume_ml` | numeric, for volume packs |
| `unit_count` | integer, for count packs |

`security_invoker = on` → RLS of `products`/`product_variants` applies to the caller.
**Generated TS types mark every column nullable** (Postgres can't infer view nullability) — null-filter `id`/`name` after selecting.

### `v_masters_search` — flat catalog search view
One row per variant, joined to product and category. The masters list/search screens read this.

Columns: `variant_id`, `sku`, `is_active`, `unit_value`, `unit_type`, `package_type`, `created_at`, `updated_at`, `product_id`, `product_name`, `product_description`, `product_unit_id` (FK → units, null = global), `product_fts` (tsvector — use for full-text search), `category_id`, `category_name`, `category_parent_id`.
`security_invoker = on`.

### `v_ration_scale_items_current` — current ration authorisations
Current (`valid_to IS NULL`) rows of `ration_scale_item_versions`, denormalised with scale and product info.

Columns: `version_id` (= `ration_scale_item_versions.id`), `scale_id` (FK → ration_scales), **`item_id`** (= `ration_scale_item_versions.variant_id`, aliased — it IS a `product_variants.id`), `unit_id` (= scale's unit), `scale_name`, `rank_class`, `terrain`, `scale_active`, `category` (same mapped `item_category` as `v_items_current`), `item_name` (= product name), `sku`, `auth_qty`, `uom`, `notes`, `valid_from`, `created_by`.
Owner-rights view (no `security_invoker`).

### Other current-views (same pattern, other domains)
`v_rooms_current`, `v_unit_inventory_current` — read-side "current state" projections for rooms and inventory. Same rule applies: read the view, write the base tables.

## 5. Join keys — the one id that matters

```
EligibleItem.id
  = MasterRow.id
  = v_items_current.id
  = v_masters_search.variant_id
  = v_ration_scale_items_current.item_id
  = ration_scale_item_versions.variant_id
  = product_variants.id
```

**The product-variant id is THE item id in every masters/ration cross-reference.** When ration code says "item", it means a variant. Never join a ration row to `products.id`.

## 6. RPCs

### `set_ration_scale_item(...)` → uuid
The ONLY write path for ration scale authorisations. SECURITY INVOKER, performs the SCD-2 upsert (closes the open row, inserts a new one).

```sql
set_ration_scale_item(
  p_scale_id     uuid,
  p_variant_id   uuid,        -- NOTE: p_variant_id, NOT p_item_id
  p_auth_qty     numeric,
  p_uom          public.uom,
  p_notes        text         default null,
  p_effective_at timestamptz  default now()
) returns uuid                -- new version id
```

(Dropped: `set_item_rate` — do not call.)

## 7. The versioning pattern (`…_versions` + `v_*_current`)

Used wherever history must be auditable (currently ration authorisations; rooms/inventory use the same read-view convention):

1. **History table** `<thing>_versions`: append-only SCD-2 rows with `valid_from` / `valid_to`. The current row has `valid_to IS NULL`; at most one open row per natural key (e.g. `(scale_id, variant_id)`).
2. **Current view** `v_<thing>_current`: selects only open rows, denormalised with display columns. Apps read this for "what is true now"; they query the `_versions` table directly only for history timelines.
3. **Writes** go through an RPC (e.g. `set_ration_scale_item`) which atomically closes the previous open row and inserts the new one — or, for corrections, a guarded `update` on the `_versions` table. Apps never `insert` "current" rows by hand and never write to the view.
4. Generated TS types for views are all-nullable; the app's row types (`lib/<feature>/types.ts`) narrow them after a null-filter on the key columns.

## 8. Who reads / writes what

Both apps deliberately mirror each other: masters code in `lib/masters/*` + `app/(app)/masters/*`, ration code in `lib/ration/*` + `app/(app)/ration/*`. Shared row types live in `lib/<feature>/types.ts` (no `server-only`); `lib/ration/types.ts` is byte-identical across repos. The only sanctioned cross-links: ration → masters catalog via `v_items_current` (eligible-item pickers, CSV import name→id lookup) and `parseCsv` reuse; masters → ration via read-only `v_ration_scale_items_current` authorisation chips and the pure `lib/ration/mess-type` helper.

Legend: **R** = select, **W** = insert/update/delete (or RPC).

### Masters & ration domain

| Relation | ADMIN app | USER app | Notes |
|---|---|---|---|
| `categories` | R | R | Category tree for masters forms. Seed-managed; apps do not write. |
| `products` | R/W | R/W | Masters CRUD (`lib/masters/actions.ts`). Never touch `fts`. |
| `product_variants` | R/W | R/W | Masters CRUD. |
| `v_masters_search` | R | R | Masters list/search (`lib/masters/queries.ts`). |
| `v_items_current` | R | R | Legacy-item-shaped reads: ration eligible-item picker (`lib/ration/queries.ts` `listEligibleItems`), bulk-import name→id lookup (`lib/ration/actions.ts`). |
| `ration_scales` | R/W | R/W | Scale CRUD (`lib/ration/*`). |
| `ration_scale_item_versions` | R/W | R/W | History reads; corrective updates only — normal writes go via RPC. |
| `v_ration_scale_items_current` | R | R | Current authorisations; also read by masters UI for authorisation chips. |
| RPC `set_ration_scale_item` | W | W | The canonical ration authorisation write. |

### Other shared domains (for completeness)

| Relation | ADMIN app | USER app |
|---|---|---|
| `units`, `profiles`, `user_capabilities`, `capability_templates` | R/W | R/W |
| `dependants` | R/W | R |
| `bookings`, `rooms`, `room_furniture`, `unit_furniture`, `v_rooms_current` | R/W | R/W |
| `room_bills`, `room_bill_items`, `room_bill_orders` | R/W | R/W |
| `unit_inventory`, `v_unit_inventory_current` | R/W | R/W |
| `attendance_days`, `attendance_absences` | R/W | R/W |
| `bar_chits`, `bar_chit_items` | — (migration present, no code yet) | R/W |
| `idempotency_keys` | W | W |
| `audit_log` | R | — |

RLS summary (masters/ration): `products`/`product_variants` readable when global (`unit_id IS NULL`) or own unit; `ration_scales` / `ration_scale_item_versions` readable with `ration.read` **or** `masters.read`, writable with `ration.adjust(unit_id)`.

## 9. Sync rules

1. **DB is authoritative.** When code and DB disagree, the DB wins; fix the code. Introspect the live schema read-only via PostgREST OpenAPI (`GET https://lscphcinsukrdaoytbsx.supabase.co/rest/v1/` with the service-role key) when in doubt.
2. **Migrations are mirrored.** `supabase/migrations/` must be file-identical in both repos at all times. Sync by file copy, never by re-authoring.
3. **Reads of the legacy item shape → `v_items_current`. Masters listing → `v_masters_search`. Current ration items → `v_ration_scale_items_current`.**
4. **Writes never target views.** Masters mutations hit `products` / `product_variants`; ration mutations call `set_ration_scale_item` (or guarded updates on `ration_scale_item_versions`).
5. **No `(supabase as any)` casts to bypass missing-relation type errors.** If TypeScript says a relation doesn't exist, the schema changed — port the query, don't silence the compiler.
6. **`database.types.ts` is per-app regenerated** and may carry app-specific extras; keep each app's file compiling against the live schema, but don't expect them to be identical. Shared *domain* row types (`lib/<feature>/types.ts`) ARE expected to match across repos.
7. **Mirror the admin reference.** The USER app's masters/ration structure intentionally mirrors `officer-mess-admin`; don't invent new structure in one repo only.

## 10. "When you change the schema" checklist

Any schema change (DDL) must be made via a migration and propagated to both apps. In order:

- [ ] Write the migration in ONE repo's `supabase/migrations/` with the next timestamp; apply it to the shared project (Supabase CLI / dashboard).
- [ ] **Copy the migration file verbatim into the other repo's** `supabase/migrations/` (same filename, same bytes). Verify with `diff -rq` across the two directories.
- [ ] Regenerate `lib/database.types.ts` (or equivalent) in **both** apps against the live project.
- [ ] **Update this document in both repos** (tables/views/columns/RPCs, join keys, R/W matrix) and keep the two copies identical.
- [ ] If a table/column was renamed or dropped, grep **BOTH** repos for every stale reference — including ones hidden behind `as any`:
  `grep -rn "from('<old_name>'\|rpc('<old_fn>'" lib app` and `grep -rn "as any" lib | grep -i supabase`.
- [ ] If old readers must keep working, add/extend a compatibility view (`v_*_current` pattern) in the same migration rather than leaving broken readers.
- [ ] Check RLS/grants: new tables need policies + grants; new views need `security_invoker` decided explicitly and SELECT granted to `authenticated`.
- [ ] Run both apps (`next build` or dev + exercise the affected pages) before considering the change done — type-checking alone does NOT catch stale relation names behind casts.
- [ ] Commit the migration + regenerated types + doc update in each repo (separately, but in the same change set).
