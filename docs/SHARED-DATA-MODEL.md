# SHARED DATA MODEL — Officers' Mess

> **Single source of truth for the shared MongoDB collections and Better Auth data model.**
> An IDENTICAL copy of this file lives in BOTH repos:
> - `mess-manager/docs/SHARED-DATA-MODEL.md` (Ops app)
> - `mess-admin/docs/SHARED-DATA-MODEL.md` (Admin app)
>
> If you edit one copy, you MUST edit the other so they stay byte-identical.

## 1. Ground rules

Both Next.js apps point at **one shared MongoDB database**: `mess` (configured via `MONGODB_URI` / `MONGO_URI`).

1. **The live database is the source of truth. Code adapts to the DB, never the other way round** (no app may "fix" itself by changing schemas unilaterally).
2. **Collection schemas and indexes are documented and mirrored in BOTH repos.** Database access is managed via the singleton helper `lib/mongo.ts` (`getDb()`, `getCollection()`) in both apps.
3. **Writes target base collections.** Aggregation pipelines and projections are read-only transformations; mutations go to base collections or atomic action helpers.
4. **Never cast the MongoDB collection or document to `any` to silence a missing-field or collection type error.** Stale collection references or schema drifts crash at runtime.

### Dropped collections & legacy entities — never reference these

The catalog refactor to Category-Product-Variant hierarchy **DROPPED**:

- collections `items`, `item_versions`, `pack_sizes`
- legacy RPC `set_item_rate`

Any query targeting `items` is an immediate runtime error. Legacy-shaped reads go through the aggregation helper `listItemCurrent()` / `getItemCurrent()` instead (see §5).

## 2. Enums & Domain Types

In MongoDB documents, these are stored as string values and strictly validated via Zod schemas in `lib/schemas/`:

| Enum | Values | Notes |
|---|---|---|
| `uom` | `kg` `g` `l` `ml` `piece` `pack` `bottle` | Legacy unit-of-measure; still the live type on ration quantities. |
| `item_category` | `ration` `soft_drink` `alcohol` `cigar` `grocery` `room` | Legacy category grouping; derived from root category slugs (§5). |
| `unit_type` | `ML` `LITRE` `GRAM` `KG` `PIECE` | Variant sizing unit. |
| `package_type` | `BOTTLE` `CAN` `PACKET` `BOX` `LOOSE` | Variant packaging type. |
| `ration_class` | `officer` `jco` `or` `civilian` | Ration scale rank dimension. |
| `ration_terrain` | `plains` `desert` `high_altitude` `field` `sea` | Ration scale terrain dimension. |

## 3. Better Auth & Identity Data Model

Authentication and user identity are managed by **Better Auth** (`better-auth`) with the MongoDB adapter (`@better-auth/mongo-adapter`), bearer plugin for API routes, and TOTP two-factor plugin for MFA.

### 3.1 `user` (or `users`)
Core user accounts and extended profile fields:

| Field | Type | Description |
|---|---|---|
| `id` / `_id` | string / ObjectId | Primary key |
| `email` | string | Unique email address (lowercase) |
| `emailVerified` | boolean | Verification flag |
| `name` / `full_name` | string | User's full display name |
| `image` | string \| null | Profile avatar URL |
| `role` | string | Role: `super_admin`, `unit_admin`, `admin`, `manager`, `user` |
| `unit_id` | string \| null | Primary assigned unit ID (references `units.id`) |
| `home_unit_id` | string \| null | Primary home unit ID (alias to `unit_id`) |
| `rank` | string \| null | Military rank (e.g. Major, Col, Capt) |
| `service_number` | string \| null | Military service number |
| `status` | string | Account status (`active`, `suspended`, `pending`) |
| `capabilities` | string[] | Direct user-level capability grants |
| `twoFactorEnabled` | boolean | TOTP MFA enabled status |
| `createdAt`, `updatedAt` | Date / string | Timestamps |

Unique Index: `{ email: 1 }`.

### 3.2 `session` (or `sessions`)
User active sessions:

| Field | Type | Description |
|---|---|---|
| `id` / `_id` | string / ObjectId | Primary key |
| `userId` | string | Reference to `user.id` |
| `token` | string | Session token |
| `expiresAt` | Date | Expiration timestamp |
| `ipAddress` | string \| null | Client IP address |
| `userAgent` | string \| null | Client user agent |
| `createdAt`, `updatedAt` | Date / string | Timestamps |

Unique Index: `{ token: 1 }`. Index: `{ userId: 1 }`.

### 3.3 `account` (or `accounts`)
Authentication credentials and OAuth accounts:

| Field | Type | Description |
|---|---|---|
| `id` / `_id` | string / ObjectId | Primary key |
| `userId` | string | Reference to `user.id` |
| `accountId` | string | Account identifier |
| `providerId` | string | Provider ID (`credential` for email/password) |
| `password` | string \| null | Salted and hashed password |
| `accessToken`, `refreshToken` | string \| null | Provider tokens |
| `createdAt`, `updatedAt` | Date / string | Timestamps |

Index: `{ userId: 1 }`, `{ providerId: 1, accountId: 1 }`.

### 3.4 `verification` (or `verifications`)
Verification tokens (email verification, password resets):

| Field | Type | Description |
|---|---|---|
| `id` / `_id` | string / ObjectId | Primary key |
| `identifier` | string | Target identifier (email or phone) |
| `value` | string | Token value or hash |
| `expiresAt` | Date | Expiration timestamp |
| `createdAt`, `updatedAt` | Date / string | Timestamps |

Index: `{ identifier: 1 }`.

### 3.5 `twoFactor`
TOTP two-factor configuration:

| Field | Type | Description |
|---|---|---|
| `id` / `_id` | string / ObjectId | Primary key |
| `userId` | string | Reference to `user.id` |
| `secret` | string | Encrypted TOTP secret |
| `backupCodes` | string | Backup recovery codes |

Index: `{ userId: 1 }`.

### 3.6 `user_capabilities`
Granular capability grants assigned to individual users:

| Field | Type | Description |
|---|---|---|
| `id` / `_id` | string / ObjectId | Primary key |
| `user_id` | string | Reference to `user.id` |
| `capability` | string | Granted capability (e.g. `masters.write.global`, `ration.read`) |
| `unit_id` | string \| null | Target unit, or null for platform-wide scope |
| `granted_by` | string \| null | User ID of granting admin |
| `created_at` | string / Date | Grant timestamp |

Index: `{ user_id: 1 }`, `{ user_id: 1, capability: 1, unit_id: 1 }`.

### 3.7 `capability_templates`
Role capability bundles (e.g., Bar NCO, Mess Havildar, Mess Secretary, PMC):

| Field | Type | Description |
|---|---|---|
| `id` | string | Template ID |
| `name` | string | Template display name |
| `description` | string \| null | Description of duties and permissions |
| `capabilities` | string[] | Array of capability identifiers |
| `is_system` | boolean | True for seeded system templates |
| `created_at`, `updated_at` | string / Date | Timestamps |

### 3.8 `dependants`
Family members and dependants of officers:

| Field | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `primary_profile_id` | string | Primary officer/member ID (references `user.id`) |
| `unit_id` | string | References `units.id` |
| `full_name` | string | Full name of dependant |
| `relation` | string | `'spouse' \| 'child' \| 'parent'` |
| `date_of_birth` | string \| null | Date of birth (YYYY-MM-DD) |
| `gender` | string \| null | Gender |
| `is_active` | boolean | Active status |
| `notes` | string \| null | Additional notes |
| `created_at`, `updated_at` | string / Date | Timestamps |

Index: `{ primary_profile_id: 1 }`, `{ unit_id: 1 }`.

## 4. Masters & Ration Collections

### 4.1 Masters catalog: `categories` → `products` → `product_variants`

#### `categories`
| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | string | Primary key (UUID string) |
| `name` | string | Category name (NOT NULL) |
| `parent_id` | string \| null | Reference to parent `categories.id` (self-referencing tree) |
| `slug` | string \| null | Canonical slug (`alcohol`, `cold-drinks`, `cigars`, `snacks`, `ration`, `grocery`) |
| `created_at`, `updated_at` | string / Date | Timestamps |

Seeded root categories (fixed UUIDs, prefix `00000000-0000-0000-0000-00000000000N`):
Alcohol=`…0001`, Cold Drinks=`…0002`, Cigars=`…0003`, Snacks=`…0004`, Ration=`…0005`, Grocery=`…0006`.

#### `products`
| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | string | Primary key (UUID string) |
| `category_id` | string | Reference to `categories.id` |
| `name` | string | Product name (e.g. "Old Monk XXX Rum") |
| `name_normalized` | string | Normalized `lower(trim(name))` for deduplication |
| `description` | string \| null | Optional description |
| `is_active` | boolean | Active catalog flag |
| `created_at`, `updated_at` | string / Date | Timestamps |
| `created_by`, `updated_by` | string \| null | User audit references |

Unique Index: `{ category_id: 1, name_normalized: 1 }`.
Index: `{ name: 1 }`, `{ name_normalized: 1 }`.

**`products.unit_id` dropped** (Phase 0). Products are platform-global. Units enable variants via **`unit_catalog`** and set sale rates via **`unit_menu_rates`**. See [`FOUNDATION.md`](./FOUNDATION.md) §2.

#### `unit_catalog` *(live — Phase 0 applied)*
Unit catalog adoption:

| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | string | Primary key (UUID string) |
| `unit_id` | string | Reference to `units.id` |
| `variant_id` | string | Reference to `product_variants.id` |
| `is_enabled` | boolean | Enabled for unit operations (default true) |
| `local_sku` | string \| null | Unit-specific SKU/code |
| `created_at`, `updated_at` | string / Date | Timestamps |
| `created_by`, `updated_by` | string \| null | User audit references |

Unique Index: `{ unit_id: 1, variant_id: 1 }`.

#### `unit_menu_rates` *(live — Phase 0 applied)*
Committee menu price schedule:

| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | string | Primary key (UUID string) |
| `unit_id` | string | Reference to `units.id` |
| `variant_id` | string | Reference to `product_variants.id` |
| `rate` | number | Price rate (`>= 0`) |
| `effective_from` | string | Effective date string (YYYY-MM-DD) |
| `created_at`, `updated_at` | string / Date | Timestamps |
| `created_by`, `updated_by` | string \| null | User audit references |

Unique Index: `{ unit_id: 1, variant_id: 1, effective_from: 1 }`.

#### `product_variants`
Stockable and sellable variant units:

| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | string | Primary key (UUID string) — **this is THE item id everywhere** (see §6 join keys) |
| `product_id` | string | Reference to `products.id` |
| `unit_value` | number | Numerical size / volume |
| `unit_type` | enum `unit_type` | Unit type (`ML`, `LITRE`, `GRAM`, `KG`, `PIECE`) |
| `package_type` | enum `package_type` | Packaging (`BOTTLE`, `CAN`, `PACKET`, `BOX`, `LOOSE`) |
| `sku` | string \| null | Global SKU |
| `is_active` | boolean | Active status |
| `created_at`, `updated_at` | string / Date | Timestamps |
| `created_by`, `updated_by` | string \| null | User audit references |

Unique Index: `{ product_id: 1, unit_value: 1, unit_type: 1, package_type: 1 }`.
Index: `{ product_id: 1 }`.

### 4.2 Ration: `ration_scales` → `ration_scale_item_versions`

#### `ration_scales`
| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | string | Primary key (UUID string) |
| `unit_id` | string | Reference to `units.id` |
| `name` | string | Scale name |
| `description` | string \| null | Optional description |
| `is_active` | boolean | Active flag |
| `rank_class` | enum `ration_class` | Rank dimension (`officer`, `jco`, `or`, `civilian`) |
| `terrain` | enum `ration_terrain` | Terrain dimension (`plains`, `desert`, etc.) |
| `created_at`, `updated_at` | string / Date | Timestamps |
| `created_by`, `updated_by` | string \| null | User audit references |

Unique Index: `{ unit_id: 1, rank_class: 1, terrain: 1 }` — one scale per unit/rank/terrain combination.

#### `ration_scale_item_versions` (SCD-2 history collection)
| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | string | Primary key (UUID string) (= `version_id`) |
| `scale_id` | string | Reference to `ration_scales.id` |
| `variant_id` | string | Reference to `product_variants.id` |
| `auth_qty` | number | Authorized quantity (`>= 0`) |
| `uom` | enum `uom` | Unit of measure (`kg`, `g`, `l`, `ml`, `piece`, `pack`, `bottle`) |
| `notes` | string \| null | Authorization notes |
| `valid_from` | string / Date | Start timestamp (ISO string or Date) |
| `valid_to` | string / Date \| null | End timestamp — **null indicates current open record** |
| `created_at` | string / Date | Creation timestamp |
| `created_by` | string \| null | User audit reference |

Invariant: At most **one open document** (`valid_to: null` or `$exists: false`) per `{ scale_id, variant_id }`.
Index: `{ scale_id: 1, variant_id: 1, valid_to: 1 }`.

## 5. Aggregation Pipelines & Read Projections

Instead of database views, read-side transformations and denormalizations are executed using MongoDB aggregation pipelines (`$match`, `$lookup`, `$unwind`, `$project`) in dedicated query modules:

### `listItemCurrent()` / `getItemCurrent()` — legacy-items compatibility projection
Implemented in `lib/masters/queries.ts`. Aggregates over `product_variants` joined with `products` and `categories` to return variant records in the legacy item shape:

| Field | Meaning |
|---|---|
| `id` | = `product_variants.id` — **a VARIANT id**, not a product id |
| `variant_id` | = `product_variants.id` |
| `product_id` | = `products.id` |
| `unit_id` | always `null` (`products.unit_id` dropped; catalog is global) |
| `category` | mapped `item_category` derived from root category name: Alcohol→`alcohol`, Cold Drinks→`soft_drink`, Cigars→`cigar`, Snacks→`grocery`, Ration→`ration`, Grocery→`grocery` |
| `category_name` | display category name |
| `name` | = `products.name` |
| `sku` | = variant sku |
| `uom` | mapped from `unit_type`: ML→`ml`, LITRE→`l`, GRAM→`g`, KG→`kg`, PIECE→`piece` |
| `unit_value` | numerical size/volume |
| `unit_type` | enum `unit_type` |
| `package_type` | enum `package_type` |
| `is_active` | = variant `is_active` |

Used by: Eligible item picker (`lib/ration/queries.ts`), CSV bulk-import name-to-id resolution (`lib/ration/actions.ts`), and bar/stock pickers.

### `listMasterItems()` — flat catalog search projection
Implemented in `lib/masters/queries.ts`. Aggregates variants joined to products and categories with regex/text filtering on product name and normalized name. Powers the masters list and search interfaces.

### `getRationScaleItemsCurrent()` — current ration authorisations
Implemented in `lib/ration/queries.ts`. Reads current open records (`valid_to: null`) from `ration_scale_item_versions`, joined via `$lookup` with `ration_scales`, `product_variants`, `products`, and `categories`. Powers ration authorisations matrices and authorisation chips in masters.

### Other domain projections (rooms & inventory)
- `getRoomsCurrent`: Aggregates room definitions, current occupancy, and furniture inventory.
- `getUnitInventoryCurrent`: Aggregates FIFO inventory lots from `unit_inventory` with variant and product details.

## 6. Join keys — the one id that matters

```
EligibleItem.id
  = MasterRow.id
  = itemCurrent.id
  = itemCurrent.variant_id
  = masterSearch.variant_id
  = rationScaleItemCurrent.variant_id
  = ration_scale_item_versions.variant_id
  = product_variants.id
```

**The product-variant id is THE item id in every masters/ration cross-reference.** When ration or inventory code says "item", it means a variant (`product_variants.id`). Never reference `products.id` as a stockable item or scale requirement.

## 7. Atomic Operations & Action Helpers

### `setRationScaleItem(...)` → Promise<string>
The canonical write path for ration scale authorisations (`lib/ration/actions.ts`). Replaces legacy stored procedures with a direct, atomic SCD-2 versioning routine:

```typescript
await setRationScaleItem({
  scaleId: string,
  variantId: string,
  authQty: number,
  uom: string,
  notes?: string | null,
  effectiveAt?: string,
  userId?: string | null,
}): Promise<string> // returns new version id
```

Logic:
1. Queries `ration_scale_item_versions` for an open document (`scale_id`, `variant_id`, `valid_to: null`).
2. If values match existing record, returns existing `id` (idempotent).
3. If values changed, closes open document by setting `valid_to = effectiveAt`.
4. Inserts new record with `valid_from = effectiveAt, valid_to = null` and returns the newly generated version `id`.

## 8. The versioning pattern (`…_versions` + current projections)

Used wherever history must be auditable (ration authorisations, inventory lots, tariff schedules):

1. **History collection** `<thing>_versions`: append-only SCD-2 documents with `valid_from` / `valid_to`. The current document has `valid_to: null`; at most one open document per natural key (e.g. `(scale_id, variant_id)`).
2. **Current query projections**: selects only open documents (`valid_to: null`), joining related metadata. Applications query the `_versions` collection directly only for historical timelines.
3. **Writes** go through dedicated action helpers (e.g. `setRationScaleItem`) that atomically close the open document and insert the new version. Applications never write raw partials directly to current projections.

## 9. Who reads / writes what & Access Control

Application-level RBAC & capability enforcement govern access:
- **Session Authentication:** Every request is authenticated through Better Auth (`getCurrentUser()`).
- **Capability Gates:** Mutations check `requireCapability(capability, unitId)` or `requireRole([...])` at the start of execution.
- **Tenant Scoping:** Operational queries filter documents by `{ unit_id: caller.activeUnitId }` (or `caller.homeUnitId`).

Legend: **R** = query/read, **W** = insert/update/delete.

### Masters & ration domain

| Collection | ADMIN app | Ops app | Notes |
|---|---|---|---|
| `categories` | R | R | Category tree for masters forms. Seed-managed. |
| `products` | R/W | R | Global catalog only (`unit_id` dropped). Admin CRUD; ops adopt via `unit_catalog`. |
| `unit_catalog` | R/W | R/W | Unit adoption (`unit_id`, `variant_id`, `is_enabled`, `local_sku`). |
| `unit_menu_rates` | R/W | R/W | Committee peg/bottle rate (`rate`, `effective_from`). Distinct from lot cost. |
| `product_variants` | R/W | R/W | Masters CRUD. |
| `ration_scales` | R/W | R/W | Scale CRUD (`lib/ration/*`). |
| `ration_scale_item_versions` | R/W | R/W | History reads; normal writes go via `setRationScaleItem`. |

### Other shared domains

| Collection | ADMIN app | Ops app |
|---|---|---|
| `units` | R/W | R/W |
| `user` / `users`, `profiles` | R/W | R/W |
| `user_capabilities`, `capability_templates` | R/W | R/W |
| `session`, `account`, `verification`, `twoFactor` | R/W | R/W |
| `dependants` | R/W | R |
| `bookings`, `rooms`, `room_furniture`, `unit_furniture` | R/W | R/W |
| `room_bills`, `room_bill_items`, `room_bill_orders` | R/W | R/W |
| `unit_inventory` | R/W | R/W |
| `attendance_days`, `attendance_absences` | R/W | R/W |
| `bar_chits`, `bar_chit_items` | — | R/W |
| `mess_billing_periods`, `mess_bills`, `mess_bill_line_items` | R/W | R/W |
| `mess_daily_p_rates`, `mess_subscriptions`, `mess_misc_debits` | R/W | R/W |
| `idempotency_keys` | W | W |
| `audit_log` | R/W | R/W |

Access control summary:
- `products` / `product_variants` are global (readable to authenticated sessions; writes require `masters.write.global` or `super_admin`).
- `unit_catalog` / `unit_menu_rates` are scoped by `masters.read` / `masters.write` on `unit_id`.
- `ration_scales` / `ration_scale_item_versions` are readable with `ration.read` or `masters.read`, writable with `ration.adjust(unit_id)`.
- Operational domains (`rooms.*`, `attendance.*`, `bar.*`, `billing.*`) require their respective capability scoped to `caller.activeUnitId` or `caller.homeUnitId`.

## 10. Sync rules

1. **DB is authoritative.** When code and DB disagree, the DB wins; fix the code. Introspect collections and documents via MongoDB client when in doubt.
2. **Document schemas and types are mirrored.** Shared TypeScript interfaces (`lib/<feature>/types.ts`) and Zod schemas (`lib/schemas/*`) must remain synchronized across both repos.
3. **Reads of the legacy item shape go through query projections (`listItemCurrent`, `getItemCurrent`).**
4. **Writes target base collections or atomic action helpers (`setRationScaleItem`).**
5. **No `as any` casts to bypass missing-field or collection type errors.** Define clear TypeScript interfaces for document models.
6. **Mirror the admin reference.** The Ops app masters/ration structure intentionally mirrors `mess-admin`; keep domain abstractions unified.

## 11. "When you change the schema" checklist

Any schema or field change must be coordinated across both apps:

- [ ] Define and update Zod schemas in `lib/schemas/` in both apps.
- [ ] Update TypeScript document types in `lib/<feature>/types.ts` in both apps.
- [ ] If new indexes are required, ensure index definitions are configured in MongoDB.
- [ ] **Update this document in both repos** (collections, fields, indexes, join keys, access control matrix) and keep the two copies identical.
- [ ] If a collection or field was renamed or dropped, grep **BOTH** repos for every stale reference — including ones hidden behind `as any`:
  `grep -rn "collection('<old_name>'" lib app` and `grep -rn "as any" lib`.
- [ ] If old readers must keep working, provide backwards-compatible projections in query helpers.
- [ ] Verify access control: Ensure all mutations call `requireCapability(...)` or `requireRole(...)`.
- [ ] Verify unit scoping: Ensure queries on unit-level collections enforce `{ unit_id }`.
- [ ] Run both apps (`next build` or dev + exercise the affected pages) before considering the change done.
- [ ] Commit the types and doc update in each repo.
