# Officers Mess — USER App Knowledge Document

> Codebase: `mess-manager` (`officers-mess-user`)
> Canonical Operations Application Architecture & Knowledge Base (September 2026).

---

## 1. Purpose & Audience

This is the **client / operations application** of the two-app Officers' Mess platform suite. It handles day-to-day operations and member services inside a military unit:

- **Diners / Officers:** Personal dashboard, messing (meal roll, meal cuts, guest meals), bar chits, room bookings & folios, waitlists, personal monthly bills, bulletins, and social calendar.
- **Mess Staff (Mess Secretary, PMC, Quartermaster, Bar NCO, Mess Havildar, Guest Room Clerk):** Capability-gated operational modules: daily dining-in attendance roll, ration scales & consumption ledger, stock/inventory lots, catalogue adoption & menu rates, bar chits, guest rooms management, party bookings, monthly billing engine, and unit user management.

The companion **ADMIN app** (`mess-admin`) handles multi-unit administration, capability templates, global catalog authoring, and platform-wide audits.
**Both apps share ONE MongoDB database** (`mess`) and a unified **Better Auth** identity layer.

**Core Stack:**
- **Framework:** Next.js 16.2 (App Router, React 19, Turbopack)
- **Database:** MongoDB (native Node driver `mongodb` v7.x) via singleton connection pooling in `lib/mongo.ts`
- **Authentication:** Better Auth (`better-auth` v1.7.x) backed by MongoDB adapter (`@better-auth/mongo-adapter`), featuring bearer tokens for API routes, TOTP two-factor authentication (MFA), and Next.js cookie integration
- **UI & Styling:** shadcn/ui · Tailwind v4 (`oklch` design tokens, semantic tokens only)
- **Language & Validation:** TypeScript · Zod v4 schemas (`lib/schemas/*`)
- **Client State:** Redux Toolkit (`lib/redux/*`) for authenticated user and active unit context
- **Rate Limiting & Utilities:** Upstash Redis (`@upstash/ratelimit`, `@upstash/redis`) · Vitest

**Next.js 16 Gotcha:** Middleware is renamed to **Proxy**. The file is `proxy.ts` at the project root and exports a `proxy` function (not `middleware`). Same runtime semantics as Next 15 middleware.

**App Segregation Contract:**
- `super_admin` and `admin` accounts manage the platform from the Admin Console and may not hold active operational sessions in `mess-manager`.
- The Next.js proxy (`proxy.ts`) and page gate (`requireUser()`) actively bounce administrative sessions to `/auth/signout?error=admin_console` or redirect them to `NEXT_PUBLIC_ADMIN_APP_URL`.
- Operations roles (`user`, `manager`, `unit_admin`, Bar NCO, Mess Havildar, etc.) sign in and operate here.

---

## 2. Route Map

### 2.1 Authenticated Shell (`app/(app)/*`)

All operational pages render inside `app/(app)/layout.tsx`. The layout calls `requireUser()`, loads UI preferences from the `ui_prefs` cookie, loads unit context, and wraps children in:
`TooltipProvider` → `ModalStyleProvider` → `AppContextProvider` (Redux) → `SidebarProvider`.

| Route | File | Purpose | Gate |
|---|---|---|---|
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Officer landing page: welcome banner, today's meals, bookings, bulletins, calendar events | `requireUser()` |
| `/messing` | `app/(app)/messing/page.tsx` | "My Messing": meal attendance, cuts, guest meals, kitchen register | `attendance.read` |
| `/attendance` | `app/(app)/attendance/page.tsx` | Daily dining-in roll + monthly calendar; roster save/finalize/reopen, unit mess config | `attendance.read` |
| `/ration` | `app/(app)/ration/page.tsx` | Unit ration scales, scale items table, authorisation matrix, consumption ledger, stock transactions, daily calculation | `ration.read` |
| `/ration/scales/[id]` | `app/(app)/ration/scales/[id]/page.tsx` | Single scale detail: current items, SCD-2 version history, edit/deactivate | `ration.read` (scale's unit) |
| `/stock` | `app/(app)/stock/page.tsx` | Unit inventory lots per stockable category (alcohol, soft_drink, cigar, grocery); add/edit/adjust/deactivate lots | `inventory.read` |
| `/masters` | `app/(app)/masters/page.tsx` | Operational catalogue & redirect hub: Category → Product → Variant, unit adoption (`unit_catalog`), menu rates (`unit_menu_rates`) | `masters.read` |
| `/bar` | `app/(app)/bar/page.tsx` | Bar operations: chit creation against members/room guests, inventory deduction | `bar.read` |
| `/guest-rooms` | `app/(app)/guest-rooms/page.tsx` | Rooms list, booking calendar, check-in/out, folio bills, orders, furniture inventory | `rooms.read` |
| `/waitlist` | `app/(app)/waitlist/page.tsx` | Room booking waitlist management and request lifecycle | `rooms.read` |
| `/party` | `app/(app)/party/page.tsx` | Party bookings, function catering chits, hall reservations | `parties.read` |
| `/bulletins` | `app/(app)/bulletins/page.tsx` | Unit noticeboard: daily orders, announcements, circulars | `requireUser()` |
| `/calendar` | `app/(app)/calendar/page.tsx` | Unit social calendar events, attendee RSVPs, monthly publishes | `requireUser()` |
| `/billing` | `app/(app)/billing/page.tsx` | "My Bills" & Billing Ops: monthly invoices, line items, subscriptions, debits, generate/publish bills | `billing.read` |
| `/users` | `app/(app)/users/page.tsx` | Unit user management: invite, role assignment, capability overrides, activate/deactivate | `users.read` |
| `/settings` | `app/(app)/settings/page.tsx` | Profile fields + unit configuration card (mess type, terrain, billing rates) | `requireUser()` |

Shared shell components live in `app/(app)/_components/`:
- `app-sidebar.tsx`: Dynamic capability-gated sidebar navigation (`nav-config.ts` with `NAV_DINER` and `NAV_OPS`).
- `app-navbar.tsx`: Header navigation, active unit display, and user profile trigger.
- `unit-switcher.tsx`: Switcher component for administrators managing multiple units (admin-only).
- `user-menu.tsx`: User profile details, theme switcher, and sign-out button.
- `theme-toggle.tsx`: Light/dark mode toggle using CSS variables and semantic tokens.
- `module-placeholder.tsx`: Capability-aware placeholder card for upcoming features.

### 2.2 Marketing & Authentication Routes

- **Marketing:** `app/(marketing)/page.tsx` — Public landing page (`/`), displays "Dashboard" CTA when signed in.
- **Auth Pages:** `app/(auth)/*`:
  - `/sign-in` — Email/password sign-in form with Next.js Server Actions.
  - `/forgot-password` — Password recovery trigger generating MongoDB verification tokens.
  - `/reset-password` — Password reset form gated by recovery token and `om-flow-gate` cookie.
  - `/accept-invite` — Account onboarding form for invited users.
  - `/mfa/enroll` & `/mfa/verify` — TOTP two-factor enrollment and verification powered by Better Auth.
- **Auth Route Handlers:**
  - `app/api/auth/[...all]/route.ts` — Better Auth HTTP endpoint handler via `toNextJsHandler(auth)`.
  - `app/auth/confirm/route.ts` — Verifies email-link tokens against MongoDB `verifications` collection, sets flow-gate cookie, and redirects.
  - `app/auth/signout/route.ts` — Server-side sign-out handler terminating Better Auth session and clearing session cookies.
  - `app/auth/callback/route.ts` — Provider callback handler.

### 2.3 REST API (`app/api/v1/*`)

All `/api/v1/*` routes provide a versioned REST interface for mobile clients and headless integrations:
- Wrapped with `withRoute` (`lib/api/handler.ts`) for consistent JSON responses and error serialization.
- Authenticated via `requireApiUser` (`lib/api/auth.ts`) reading Better Auth bearer tokens.
- Enforces capability gates via `requireApiCapability` / `requireApiRole`.
- Idempotency support via `lib/api/idempotency.ts` backed by MongoDB `idempotency_keys` collection.
- Rate-limited via Upstash Redis (`lib/api/rate-limit.ts`).
- Interactive OpenAPI documentation rendered via Scalar at `/api/v1/docs` from `/api/v1/openapi.json`.

---

## 3. Data Layer Architecture (`lib/*`)

The project follows a modular, domain-driven structure under `lib/`. Every feature exports:
- `types.ts` — Shared TypeScript document types and interfaces (safe for client and server components; **no** `import 'server-only'`).
- `queries.ts` — Read-only data queries (`import 'server-only'`), querying MongoDB collections via `getDb()` or `getCollection()`.
- `actions.ts` — Server mutations (`'use server'`), enforcing authorization (`requireCapability` or `requireRole`) as the first statement, validating inputs via Zod, mutating MongoDB collections, and calling `revalidatePath(...)`.

### 3.1 MongoDB Infrastructure (`lib/mongo.ts`)

MongoDB connection pooling is handled by a singleton `MongoClient` cached across hot reloads in development:

```typescript
import 'server-only';
import { MongoClient, type Db, type Collection, type Document } from 'mongodb';

// Singleton client connection cache
export { clientPromise, client };
export async function getMongoClient(): Promise<MongoClient>;
export async function getDb(dbName = 'mess'): Promise<Db>;
export async function getCollection<T extends Document = Document>(
  collectionName: string,
  dbName = 'mess'
): Promise<Collection<T>>;
```

All database queries connect through `getDb()` or `getCollection<T>()`. No external ORM or query builder is used; queries leverage native MongoDB driver filters, update operators (`$set`, `$inc`, `$push`), and aggregation pipelines.

### 3.2 Better Auth & Identity Layer (`lib/auth/`)

- **Configuration (`lib/auth/auth.ts`):**
  - Instantiates `betterAuth` configured with `mongodbAdapter(db, { client })`.
  - Secret configured via `BETTER_AUTH_SECRET`.
  - Base URL resolved from `BETTER_AUTH_URL` or `NEXT_PUBLIC_SITE_URL`.
  - Enabled plugins: `bearer()` (API token auth), `twoFactor()` (TOTP MFA), and `nextCookies()` (cookie synchronization).
  - Extended user document fields: `role`, `unit_id`, `home_unit_id`, `rank`, `service_number`, `full_name`, `status`, `capabilities`.
- **Client Auth (`lib/auth/auth-client.ts`):**
  - Exports `authClient = createAuthClient({ plugins: [twoFactorClient()] })` for client-side authentication interactions.
- **Session & Identity Resolution (`lib/auth/get-current-user.ts`):**
  - `getCurrentUser(customHeaders?)` — React `cache`d helper. Extracts session from headers via `auth.api.getSession()`.
  - Queries MongoDB `users` (or `user`) collection by `ObjectId` or string ID.
  - Resolves authorization level: `aal` (`'aal1'` or `'aal2'` based on `twoFactorEnabled` or `mfa_enabled`).
  - Resolves unit context: Admin accounts read active unit from `om_active_unit_id` cookie or header; regular users are pinned to `home_unit_id`.
  - Resolves capabilities: Merges role capabilities with individual grants in `user.capabilities`.
  - Enforcement functions: `requireUser()`, `requireRole(allowedRoles)`, `requireCapability(cap, unitId)`, and `requireApiUser(req)`.
- **Email Verification & Token Management (`lib/auth/email-links.ts`):**
  - Verification tokens stored in MongoDB `verifications` collection (`token`, `identifier`, `type`, `expiresAt`, `used`).
  - Helper `buildAuthConfirmLink()` builds first-party confirmation links `${NEXT_PUBLIC_SITE_URL}/auth/confirm?token=...&type=...`.
  - Helper `verifyAuthToken()` and `markTokenUsed()` handle token validation and replay prevention.
- **Flow Gate (`lib/auth/flow-gate.ts`):**
  - Confines partially-trusted recovery or invite sessions to `/reset-password` or `/accept-invite` using the `om-flow-gate` cookie.
- **MFA Management (`lib/auth/mfa.ts`):**
  - Manages TOTP secrets, verification codes, and recovery codes backed by Better Auth `twoFactor` collection.

### 3.3 Masters & Catalog (`lib/masters/`)

Implements the global catalog and local unit adoption model:
- **Collections:**
  - `categories` — Category tree (`alcohol`, `cold-drinks`, `cigars`, `snacks`, `ration`, `grocery`).
  - `products` — Platform-wide canonical products (`name`, `name_normalized`, `category_id`). Products have **no** `unit_id` (platform-global).
  - `product_variants` — Stockable/sellable variant units (`unit_value`, `unit_type`, `package_type`, `sku`). **The reference key (`variant_id`) across all modules.**
  - `unit_catalog` — Unit adoption mapping `(unit_id, variant_id, is_enabled, local_sku)`. Units adopt variants rather than creating duplicate products.
  - `unit_menu_rates` — Committee menu sale rate schedule `(unit_id, variant_id, rate, effective_from)`.
- **Queries (`queries.ts`):**
  - `listCategories()` — Fetches category tree.
  - `listMasterItems(categorySlug, opts)` — Aggregates categories, products, and variants with regex search and pagination.
  - `listMasterAuthorisations(unitId)` — Aggregates active ration authorisations for catalog chips.
- **Actions (`actions.ts`):**
  - `adoptVariantAction()`, `unadoptVariantAction()` — Manages unit catalog adoption in `unit_catalog`.
  - `setUnitMenuRateAction()` — Updates unit menu rates in `unit_menu_rates`.
  - `createProductAndVariantAction()`, `updateMasterItemAction()`, `bulkImportMasterItemsAction()` — Global catalog mutations (gated by `masters.write.global`).

### 3.4 Ration Management (`lib/ration/`)

- **Collections:**
  - `ration_scales` — Scale definition per `(unit_id, rank_class, terrain)`.
  - `ration_scale_item_versions` — SCD-2 versioned scale requirements `(scale_id, variant_id, auth_qty, uom, valid_from, valid_to)`. `valid_to: null` denotes the active version.
  - `ration_consumptions` — Daily calculated draws `(unit_id, scale_id, variant_id, date, quantity)`.
  - `ration_stock_transactions` — Unit ration stock ledger `(unit_id, variant_id, transaction_date, type, quantity, rate, amount)`.
- **SCD-2 Versioning Helper (`directSetRationScaleItem` / `setRationScaleItem`):**
  - Atomically closes the existing open version row (`valid_to = now()`) and inserts a new active version row (`valid_to = null`).
- **Queries (`queries.ts`):**
  - `listScales(opts)` — Lists scales for a unit.
  - `getScale(id)` — Scale details and current items.
  - `listEligibleItems(unitId, q)` — Queries active ration/grocery variants for item selection.
  - `getAuthorisationMatrix(unitId)` — Aggregation pipeline pivoting active scale items into an item × scale matrix.
  - `getRationStockReport(unitId, month)` — Aggregation computing opening balance, receipts, issues, returns, and closing balances.
- **Actions (`actions.ts`):**
  - `createScaleAction()`, `updateScaleAction()`, `deleteScaleAction()`.
  - `upsertScaleItemAction()`, `removeScaleItemAction()`, `bulkUpdateScaleItemsAction()`, `bulkImportScaleItemsAction()`.
  - `recordRationTransactionAction()` — Inserts transactions into `ration_stock_transactions`.

### 3.5 Unit Inventory & Stock (`lib/stock/`)

- **Collection:** `unit_inventory` — Unit stock lots `(unit_id, variant_id, category, quantity_packs, rate_per_pack, opened_pack_qty, acquired_on, is_active)`.
- **Queries (`queries.ts`):**
  - `listInventory(unitId, category)` — Fetches inventory lots joined with variant and product details.
  - `listMasterItemsForPicker(unitId)` — Returns adopted variants available for stock intake.
- **Actions (`actions.ts`):**
  - `createLotsAction()`, `updateLotAction()`, `adjustQtyAction()`, `deactivateLotAction()`.
- **Compute Helpers (`compute.ts`):**
  - Pure calculation functions: `PEG_ML` (60 ml or 30 ml), `derivedUnitsPerPack`, `costPerServing`, `servingsOnHand`, `lotValue`, `consumeCost`. Tested in `compute.test.ts`.

### 3.6 Bar Operations (`lib/bar/`)

- **Collections:**
  - `bar_chits` — Bar chit header `(unit_id, chit_number, chit_date, member_id, guest_room_booking_id, total_amount, status)`.
  - `bar_chit_items` — Chit line items `(chit_id, variant_id, quantity, peg_fraction, unit_rate, total_amount)`.
- **Queries (`queries.ts`):**
  - `getBarInventory(unitId)` — Available bar lots.
  - `listBarChits(unitId, opts)` — Fetches chits with member details and line items.
  - `listUnitMembers(unitId)` — Unit members eligible to sign chits.
  - `listActiveBookings(unitId)` — Checked-in room guests eligible to charge bar chits to their room folio.
- **Actions (`actions.ts`):**
  - `createBarChitAction()` — Validates variants, computes rates from `unit_menu_rates`, decrements stock from `unit_inventory` (FIFO), and inserts `bar_chits` and `bar_chit_items`. Includes compensating rollbacks on partial failures. Tested in `actions.test.ts`.

### 3.7 Attendance & Dining Roll (`lib/attendance/`)

- **Collections:**
  - `attendance_days` — Daily muster status `(unit_id, date, status, meal_flags, finalized_by, finalized_at)`.
  - `attendance_absences` — Individual officer leave/duty absences `(attendance_day_id, user_id, absence_type)`.
  - `profiles` / `users` — Unit members roster.
  - `dependants` — Family dependants dining on muster.
- **Queries (`queries.ts`):**
  - `getAttendanceDay(unitId, date)` — Muster status and dining-in counts.
  - `listDiningCandidates(unitId)` — Active members and dependants eligible for dining.
  - `getMonthlyAttendance(unitId, yearMonth)` — Calendar matrix of dining status.
- **Actions (`actions.ts`):**
  - `saveAttendanceAction()`, `finalizeAttendanceAction()`, `reopenAttendanceAction()`.
  - `setDiningInAction()`, `setUnitConfigAction()`.

### 3.8 Messing & Kitchen Register (`lib/messing/`)

- **Collections:**
  - `messing_flat_rates` — Unit flat rate configurations.
  - `mess_daily_expenditures` — Daily grocery and kitchen expenditures.
  - `mess_daily_p_rates` — Daily calculated messing cost per officer.
  - `mess_meal_cuts` — Member meal cut requests submitted before cutoff time.
  - `guest_meals` — Guest meals hosted by officers.
- **Queries (`queries.ts`):**
  - `getMessingConfig(unitId)` — Unit messing billing mode (flat rate vs daily expenditure P-rate).
  - `getMealCuts(unitId, date, userId)` — Retrieves meal cut records.
  - `getDailyKitchenRoll(unitId, date)` — Net diners after applying cuts and adding guests.
- **Actions (`actions.ts`):**
  - `submitMealCutAction()`, `cancelMealCutAction()`, `recordGuestMealAction()`, `recordDailyExpenditureAction()`.

### 3.9 Guest Rooms & Folios (`lib/guest-rooms/`)

- **Collections:**
  - `rooms` — Room definitions `(unit_id, room_number, room_type, daily_rate, status)`.
  - `bookings` — Reservations `(unit_id, room_id, guest_name, check_in_date, check_out_date, status, booking_type)`.
  - `room_bills` — Folio headers `(booking_id, unit_id, total_amount, payment_status)`.
  - `room_bill_items` — Folio line items for room rent, meals, and bar chits.
  - `room_bill_orders` — Room service orders.
  - `room_furniture`, `unit_furniture` — Room asset inventory.
- **Queries (`queries.ts`):**
  - `getRooms(unitId)`, `getBookings(unitId)`, `getBookingById(id)`, `getAvailableRooms(unitId, checkIn, checkOut)`.
- **Actions (`actions.ts`):**
  - `createRoomAction()`, `createBookingAction()`, `checkInAction()`, `checkOutAction()`.
  - `cancelBookingAction()`, `addFolioItemAction()`, `updateStayAndRatesAction()`.

### 3.10 Room Waitlist (`lib/waitlist/`)

- **Collection:** `room_waitlist_requests` — Waitlist entries `(unit_id, member_id, preferred_room_type, check_in, check_out, priority, status)`.
- **Queries & Actions:** Lifecycle management for requests, auto-expiration, and booking conversion upon vacancy.

### 3.11 Party & Function Catering (`lib/parties/`)

- **Collections:**
  - `party_bookings` — Function bookings `(unit_id, organizer_id, event_name, event_date, guest_count, hall_id, status)`.
  - `party_chit_items` — Food and beverage chits assigned to the function.
- **Queries & Actions:** Function scheduling, catering requirements, bar allocation, and billing roll-up.

### 3.12 Bulletins & Social Calendar (`lib/bulletins/`, `lib/calendar/`)

- **Collections:**
  - `unit_bulletins` — Noticeboard items `(unit_id, title, content, is_pinned, expires_at, created_by)`.
  - `social_calendar_events` — Unit calendar events `(unit_id, title, event_date, start_time, dress_code, rsvp_deadline)`.
  - `social_calendar_publishes` — Monthly published calendar snapshots.
- **Queries & Actions:** Bulletin posting, event scheduling, member RSVPs, and calendar publication.

### 3.13 Monthly Billing Engine (`lib/billing/`)

- **Collections:**
  - `mess_billing_periods` — Monthly billing cycle `(unit_id, period_code, start_date, end_date, is_closed)`.
  - `mess_bills` — Member monthly invoice header `(unit_id, billing_period_id, profile_id, total_due, status)`.
  - `mess_bill_line_items` — Itemized charges from messing, bar, rooms, parties, subscriptions, and debits.
  - `mess_subscriptions` — Recurring monthly subscriptions (e.g. library, sports, entertainment).
  - `mess_misc_debits` — Ad-hoc charges and committee fines.
  - `mess_bill_email_sends` — Email dispatch log for sent bills.
- **Compute Engine (`compute.ts`):**
  - Aggregates daily messing costs, signed bar chits, room folio balances, party expenses, fixed subscriptions, and adjustments.
  - Tested extensively in `compute.test.ts`.
- **Actions (`actions.ts`):**
  - `createBillingPeriodAction()`, `runBillingEngineAction()`, `publishBillsAction()`, `sendBillEmailsAction()`.

### 3.14 Unit Users & Capabilities (`lib/users/`)

- **Collections:**
  - `users` (or `user`) — Base identity and profile fields.
  - `user_capabilities` — Specific capability grants `(user_id, capability, unit_id, granted_by)`.
  - `capability_templates` — System templates (Bar NCO, Mess Havildar, Mess Secretary, PMC, Quartermaster).
- **Actions (`actions.ts`):**
  - `fetchUnitUsersAction()`, `fetchCapabilityTemplatesAction()`.
  - `inviteUserAction()` — Creates pending user in `users`, generates invite token via `email-links.ts`, and emails onboarding link.
  - `updateUserAction()`, `updateUserCapabilitiesAction()`, `toggleUserActiveAction()`.

### 3.15 Audit Logging (`lib/audit/`)

- **Collection:** `audit_log` — Immutable audit records `(id, actor_id, unit_id, action, target_collection, document_id, diff, created_at)`.
- Writes audit entries for all sensitive operational actions (financial adjustments, catalog changes, capability grants).

### 3.16 REST API Framework (`lib/api/`)

- `handler.ts` — `withRoute` wrapper providing uniform error handling, JSON responses (`ok`, `created`, `noContent`, `list`).
- `auth.ts` — Bearer token authentication `requireApiUser`, `requireApiRole`, `requireApiCapability`.
- `errors.ts` — Typed `ApiError` class and `Errors` dictionary (e.g. `unauthenticated`, `forbidden`, `notFound`, `badRequest`).
- `idempotency.ts` — Idempotency-Key support persisted in MongoDB `idempotency_keys` collection.
- `rate-limit.ts` — Upstash Redis rate limiting for REST endpoints.
- `pagination.ts` — Base64 cursor encoding and decoding helpers.

---

## 4. Auth & Capability Architecture

### 4.1 Roles & Capability Model

- **Roles:** `user`, `manager`, `unit_admin`, `super_admin` / `admin`.
- **Capabilities (`lib/auth/types.ts`):**
  - `masters.read`, `masters.write` (unit adopt & menu rates), `masters.write.global` (global catalog CRUD).
  - `attendance.read`, `attendance.write`, `attendance.finalize`.
  - `ration.read`, `ration.issue`, `ration.adjust`.
  - `inventory.read`, `inventory.write`.
  - `bar.read`, `bar.write`, `bar.finalize`.
  - `rooms.read`, `booking.write`, `rooms.manage`.
  - `parties.read`, `parties.write`.
  - `users.read`, `users.write`.
  - `billing.read`, `billing.generate`, `billing.publish`.
  - `reports.unit`, `reports.cross_unit`.
- **Capability Bundles:** Seeded templates provide quick capability assignment:
  - **Bar NCO:** `inventory.read/write`, `bar.read/write/finalize`, `masters.read`.
  - **Mess Havildar:** Full operational access to attendance, messing, stock, and ration issuing.
  - **Mess Secretary & PMC:** Admin-grade operational access across all unit modules.
  - **Quartermaster:** Ration ledger and stock lot adjustments.
  - **Guest Room Clerk:** Room bookings, check-in/out, folios, and waitlist management.

### 4.2 Security Checklist (Three-Layer Enforcement)

Every feature in the application enforces security at three distinct boundaries:

1. **Page Gate (Server Component):**
   - Every page in `app/(app)/**/page.tsx` starts with exactly one explicit gate: `requireUser()`, `requireRole([...])`, or `requireCapability(capability, unitId)`.
2. **Server Action Gate (`'use server'`):**
   - Every exported server action parses and validates input with Zod, then executes `await requireCapability(cap, unitId)` or `await requireRole([...])` before executing any MongoDB mutation.
3. **API Route Gate (`app/api/v1/**/route.ts`):**
   - Wrapped with `withRoute(...)`. Enforces bearer token auth via `requireApiUser(req)` and capability checks via `requireApiCapability(req, capability, unitId)`.
4. **Tenant Isolation:**
   - Operational MongoDB queries filter documents by `{ unit_id: user.active_unit_id }` (or `user.home_unit_id`).

Audit command to verify all server actions are gated:
```bash
grep -rn "'use server'" lib app | xargs grep -L "requireCapability\|requireRole\|requireUser"
```

---

## 5. Universal Join Keys & Catalog Segregation

The data model maintains strict separation between platform-global identity and unit-level operational adoption:

```
Platform (Admin Console writes)
  categories → products → product_variants       ← Global identity only

Unit (Ops App writes)
  unit_catalog          ← Adoption: which variants this mess uses
  unit_menu_rates       ← Optional peg/bottle committee menu sale rate
  unit_inventory        ← FIFO stock lots (quantity, pack rate, acquired date)
  ration_scale_item_versions / ration_stock_transactions

Transactions (Immutable records)
  bar_chit_items        ← variant_id + rate snapshot
  ration_consumptions   ← variant_id + auth_qty snapshot
```

### The Universal Join Key

```
EligibleItem.id
  = MasterRow.id
  = variant.id
  = bar_chit_items.variant_id
  = unit_inventory.variant_id
  = ration_scale_item_versions.variant_id
  = product_variants.id
```

**Rule:** `product_variants.id` is the canonical item ID everywhere in operational code. When stock, bar, or ration code refers to an "item", it means a variant (`product_variants.id`). Never reference `products.id` as a stockable or billable item.

---

## 6. State Management

- **Server-First:** Async React Server Components fetch data directly from MongoDB via `lib/*/queries.ts` and pass plain props to UI components.
- **Mutations:** Server actions execute atomic MongoDB mutations and trigger `revalidatePath(...)` to refresh Server Component caches.
- **Client Redux Toolkit:**
  - `lib/redux/store.ts` (`makeStore`), `lib/redux/auth-slice.ts` (`setAuthUser`, `setActiveUnit`), `lib/redux/hooks.ts`.
  - Hydrated once per request by `lib/auth/context.tsx` (`AppContextProvider`) mounted in `app/(app)/layout.tsx`. Client components read session state via `useAppContext()`.
- **Cookies:**
  - `om_active_unit_id`: Admin active unit switcher context.
  - `ui_prefs`: Modal rendering style (`dialog` vs `sheet`).
  - `om-flow-gate`: Confinement cookie for password recovery and invite flows.
- **URL Search Parameters:** Master catalog filters (`?cat&q&page&sortBy`), ration filters (`?terrain&rank_class`), attendance calendar (`?date&view&month`), and stock tabs.

---

## 7. Environment & Developer Workflow

### 7.1 Environment Configuration (`.env.local`)

```bash
# Database & Better Auth
MONGODB_URI="mongodb+srv://..."
BETTER_AUTH_SECRET="your-32-character-secret"
BETTER_AUTH_URL="http://localhost:3000"

# Application URL
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# Rate Limiting (Upstash Redis) - optional, no-ops if unset
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# Transactional Email (Resend) - optional
RESEND_API_KEY=""
RESEND_FROM_EMAIL="Officers' Mess <onboarding@resend.dev>"

# Companion Admin App URL (for cross-app bounce & redirects)
NEXT_PUBLIC_ADMIN_APP_URL="http://localhost:3001"
```

### 7.2 Scripts & Tooling

```bash
npm run dev      # Starts Next.js development server (default http://localhost:3000)
npm run build    # Production build with Turbopack and static analysis
npm run start    # Starts production server
npm run lint     # Runs Next.js ESLint configuration
npm test         # Runs Vitest unit tests (bar actions, billing compute, stock compute)
npx tsc --noEmit # TypeScript type checking
```

### 7.3 Design System & Styling Rules

- Styling strictly adheres to semantic tokens defined in `app/globals.css` and mapped via Tailwind v4 `@theme inline`.
- **Allowed:** `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card`, `bg-muted`, `bg-primary`, `text-primary`, `bg-accent`, `bg-destructive`, `text-destructive`, `border-border`, `ring-ring`.
- **Prohibited:** Hardcoded color palette classes (`text-gray-500`, `bg-blue-600`, `text-red-500`), arbitrary color codes (`text-[#abc]`), and inline color styles.
- **Typography:** Geist fonts mapped via `--font-sans` and `--font-geist-mono` in `app/layout.tsx`.
