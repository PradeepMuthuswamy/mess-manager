# Phase 1 — Guest Rooms: Field Spec & Gap Register

> **Audit date:** 2026-09-09 · **10 parallel agent audits**  
> **Foundation:** [`FOUNDATION.md`](../FOUNDATION.md) · **Master data:** catalog for bar lines only; rent/food = tariff domain (§2.3)  
> **Requirements:** [`requirements.md`](../requirements.md) §5 (REQ-GR-*)

---

## 0. Executive summary

| Area | Ready | Gaps |
|------|-------|------|
| **DB schema (core)** | ~85% | Dual `room_bills` status; no `bar` on items; no UNIQUE booking↔bill |
| **Zod schemas** | ~80% | Missing host refine on update; no email validation; `bar` category absent |
| **Server actions** | ~70% | No transactions; checkout errors swallowed; no bar sync |
| **UI — booking form** | ~90% | Category/host/settlement wired |
| **UI — billing/checkout** | ~60% | Payment in checkout-dialog; billing-dialog missing bar lines |
| **Bar integration** | ~30% | Write path only; no folio rollup |
| **REST API** | 0% | No `/api/v1/guest-rooms/*` |
| **Billing engine rollup** | ~40% | `host_profile_id` fixed; bar `signed` bug; wrong date filter |
| **Tests** | ~10% | Schema unit tests only |

**Phase 1 is shippable after:** status merge migration + bar rollup + checkout hardening + API (minimum 4 routes).

---

## 1. Connection model (keep simple)

```
bookings ──1:1──► room_bills ──1:N──► room_bill_items
     │                    ▲
     │ host_profile_id    │ sync at checkout
     │ settlement_type    │
bar_chits.booking_id ──────┘ (category=bar, bar_chit_id)

CHARGE_TO_HOST + host_profile_id ──► mess_bills.room_amount (Phase 4)
DIRECT_SETTLEMENT ──► guest pays at checkout (paid)
```

---

## 2. Table: `bookings`

**Migrations:** `20260512080024`, `20260612124217`, `20260615000000`

| Field | SQL type | Null | Default | Max / CHECK | Zod create | Zod update | UI | Action gaps |
|-------|----------|------|---------|-------------|------------|------------|-----|-------------|
| `id` | uuid | NO | gen_random_uuid() | PK | auto | — | hidden | — |
| `unit_id` | uuid | NO | — | FK → units | uuid required | — | prop | — |
| `room_id` | uuid | NO | — | FK → rooms | uuid required | uuid opt | Select **required** | Overlap check only |
| `guest_name` | text | NO | — | DB: unlimited; **Zod: 200** | min(1) max(200) | same | Input **required** | No salutation split |
| `guest_rank` | text | YES | — | Zod: 50 | max(50) opt | same | Input optional | Free text, no rank enum |
| `guest_phone` | text | YES | — | Zod: 30 | max(30) opt | same | Input optional | **No +91/10-digit regex** |
| `guest_email` | text | YES | — | — | trim nullable; **no .email()** | same | type=email | **Invalid emails pass Zod** |
| `check_in_date` | date | NO | — | check_out > check_in (DB) | YYYY-MM-DD + refine | regex only; **no refine** | date **required** | — |
| `check_out_date` | date | NO | — | same | same | same | date **required** | — |
| `actual_check_in` | timestamptz | YES | — | — | — | datetime opt | hidden | set check-in |
| `actual_check_out` | timestamptz | YES | — | — | — | datetime opt | hidden | set checkout |
| `status` | text | NO | confirmed | confirmed, checked_in, checked_out, cancelled | enum default confirmed | enum opt | hidden | **Update can bypass lifecycle** |
| `booking_category` | enum | NO | MEMBER_GUEST | 4 values (below) | default MEMBER_GUEST | opt | Select | No per-category required fields |
| `host_profile_id` | uuid | YES | — | FK → profiles | uuid nullable | same | Select | **CHARGE_TO_HOST only validated on create** |
| `settlement_type` | enum | NO | DIRECT_SETTLEMENT | DIRECT_SETTLEMENT, CHARGE_TO_HOST | default | opt | Select | Transit/outside → auto DIRECT |
| `special_requests` | text | YES | — | Zod: 500 | max(500) | same | **single-line Input** | Should be Textarea |
| `created_at` | timestamptz | NO | now() | — | — | — | hidden | — |
| `updated_at` | timestamptz | NO | now() | trigger | — | — | hidden | — |
| `created_by` | uuid | YES | — | FK auth.users | — | — | hidden | Not profiles.id |

### Enums

**`booking_category`:** `MEMBER_GUEST` | `TRANSIT_OFFICER` | `OFFICIAL_DELEGATION` | `OUTSIDE_CIVILIAN`

**`guest_settlement_type`:** `DIRECT_SETTLEMENT` | `CHARGE_TO_HOST`

**`status`:** `confirmed` | `checked_in` | `checked_out` | `cancelled`

### Booking gaps (future columns — not in schema)

| Field | Why | Priority |
|-------|-----|----------|
| `guest_service_no` | Officer ID on register | P2 |
| `td_reference` | Transit officer movement order | P2 if TRANSIT_OFFICER |
| `expected_arrival_time` | Today board / NCO ops | P1 nice-to-have |
| `relationship_to_host` | Parent/spouse for MEMBER_GUEST | P2 |
| `booked_by_profile_id` | Clerk vs sponsor distinction | P2 |

### REQ-GR mapping

| REQ | Status |
|-----|--------|
| REQ-GR-02 Create booking | ~70% |
| REQ-GR-03 Sponsor + billing target | ~80% (update gap) |
| REQ-GR-20 Overlap reject | App-layer only |
| REQ-GR-21 Cancel pre check-in | Action-only |

---

## 3. Table: `room_bills`

**Migrations:** `20260512080024`, `20260615000000`

| Field | SQL type | Null | Default | CHECK / enum | Set at |
|-------|----------|------|---------|--------------|--------|
| `id` | uuid | NO | gen_random_uuid() | PK | insert |
| `unit_id` | uuid | NO | — | FK units | **check-in** |
| `booking_id` | uuid | NO | — | FK bookings CASCADE | **check-in** |
| `total_amount` | numeric(12,2) | NO | 0 | — | **checkout** (sum items) |
| `status` | text | NO | draft | draft, finalized, paid | check-in=draft; checkout=finalized |
| `settlement_type` | guest_settlement_type | NO | DIRECT_SETTLEMENT | enum | default; **checkout overwrites** |
| `payment_status` | room_bill_payment_status | NO | draft | draft, paid, transferred_to_mess_bill | **checkout** |
| `paid_amount` | decimal(12,2) | NO | 0 | >= 0 | checkout (direct only) |
| `paid_at` | timestamptz | YES | NULL | — | checkout (direct) |
| `payment_method` | text | YES | NULL | **no enum** | checkout; default `cash` |
| `payment_reference` | text | YES | NULL | — | checkout |
| `folio_number` | text | YES | NULL | no UNIQUE | checkout `FOLIO-YYYYMM-{suffix}` |
| `created_at` | timestamptz | NO | now() | — | check-in |
| `updated_at` | timestamptz | NO | now() | trigger | checkout |

### 🔴 Simplify (P1-MIG-01)

**Replace dual status with one column:**

```
status: draft | finalized | paid | transferred_to_mess_bill
```

Drop `payment_status`. Payment audit columns stay.

### Critical bugs

| Bug | Detail |
|-----|--------|
| **undoCheckOut** | Resets `status`/`total_amount` only — leaves `payment_status`, folio, payment fields stale |
| **No UNIQUE(booking_id)** | Duplicate bills on check-in retry |
| **checkout errors ignored** | UPDATE may fail; action returns `{ ok: true }` |
| **Migration 20260615000000** | May not be on remote yet |

---

## 4. Table: `room_bill_items`

**Migrations:** `20260512080024`, `20260512080035`, `20260512080039`

| Field | SQL type | Null | Default | CHECK | Zod |
|-------|----------|------|---------|-------|-----|
| `id` | uuid | NO | gen_random_uuid() | PK | — |
| `bill_id` | uuid | NO | — | FK CASCADE | passed separately |
| `category` | text | NO | — | room_rent, food, adhoc, misc | same 4; **no bar** |
| `description` | text | NO | — | — | min(1) max(500) |
| `amount` | numeric(12,2) | NO | — | — | coerce number (allows negative) |
| `quantity` | numeric(12,2) | NO | 1 | — | positive default 1 |
| `variant_id` | uuid | YES | — | FK product_variants | uuid nullable |
| `meal_type` | text | YES | — | breakfast, lunch, dinner | mealTypeSchema nullable |
| `order_id` | uuid | YES | — | FK room_bill_orders CASCADE | uuid nullable |
| `created_at` | timestamptz | NO | now() | — | — |
| **`bar_chit_id`** | — | — | — | **MISSING (P1-MIG-02)** | — |

### Check-in defaults (hardcoded)

| Line | category | amount | qty | notes |
|------|----------|--------|-----|-------|
| Rent | room_rent | `rooms.nightly_rate` | nights | nights = max(1, ceil nights) |
| Food | food | **₹900** | nights | **P1-FIX-03: unit config** |

### `room_bill_orders`

| Field | Type | Zod | UI |
|-------|------|-----|-----|
| `id` | uuid | — | — |
| `bill_id` | uuid | uuid | — |
| `label` | text | min(1) max(200) | **No UI** |
| `occurred_at` | timestamptz | datetime opt | — |
| `note` | text | max(500) nullable | — |

**Double-count bug:** Query returns all items at bill root AND nested under orders — billing-dialog totals may count twice.

---

## 5. Table: `bar_chits` (guest-room link)

| Field | Type | Guest-room use |
|-------|------|----------------|
| `id` | uuid | → room_bill_items.bar_chit_id (planned) |
| `unit_id` | uuid | Must match booking.unit_id (**no DB check**) |
| `date` | date | Consumption date |
| `profile_id` | uuid nullable | Member chit → mess bill |
| `guest_name` | text nullable | Guest label |
| `booking_id` | uuid nullable | **In-house guest → room folio** |
| `total_amount` | numeric(12,2) | Header total |
| `status` | text | **pending** (create) \| **finalized** (never set) |

**Routing:**

```
booking_id set     → room folio (P1-BAR-01)
profile_id set     → member mess bill (Phase 4)
neither            → walk-in cash
```

**Billing engine bug:** filters `status = 'signed'` → **always empty**. Fix: `'finalized'`.

---

## 6. Table: `rooms` (+ furniture)

### `rooms` (post-037)

| Field | Type | Default | CHECK / enum | Form |
|-------|------|---------|--------------|------|
| `id` | uuid | gen_random_uuid() | PK | — |
| `unit_id` | uuid | — | FK units | prop |
| `name` | text | — | unique per unit | Input required |
| `room_type` | text | Standard | Standard, Deluxe, Executive, Suite, VIP | Select |
| `nightly_rate` | numeric(12,2) | 0 | — | Input min 0 |
| `status` | text | available | available, maintenance, out_of_service | Select |
| `created_at` / `updated_at` | timestamptz | now() | — | — |

**Derived (view `v_rooms_current`):** `current_status`, `current_booking_id` — not stored.

### Form gap

**room-form.tsx** does not reset state when switching create/edit — stale data risk.

---

## 7. Zod validation matrix

| Schema | Used by action? | Gaps |
|--------|-----------------|------|
| `createBookingSchema` | ✅ create | No CHARGE_TO_HOST→host refine; status in schema |
| `updateBookingSchema` | ✅ update | No date refine; no host refine; allows status change |
| `checkOutBookingSchema` | ❌ **not wired** | checkout accepts raw object |
| `createBillItemSchema` | ✅ | No `bar` category |
| `finalizeBillSchema` | ❌ no action | Dead schema |
| `createBillOrderSchema` | ✅ | No UI caller |

### Recommended Zod additions (Phase 1)

```typescript
// create + update
.refine(d => d.settlement_type !== 'CHARGE_TO_HOST' || d.host_profile_id, {
  message: 'Host officer required when charging to mess bill',
  path: ['host_profile_id'],
})

// guest_email
z.union([z.literal(''), z.string().email()]).nullable().optional()

// guest_phone (India)
z.string().regex(/^(\+91)?[6-9]\d{9}$/).optional() // or nullable
```

---

## 8. UI component coverage

| Component | booking fields | bill/payment | Gaps |
|-----------|----------------|--------------|------|
| `booking-form.tsx` | ✅ all Phase 1 | N/A | email/phone validation |
| `booking-details-dialog.tsx` | ✅ read-only | no payment_status | badges |
| `billing-dialog.tsx` | ❌ | folio edit only | **no payment, no bar lines** |
| `checkout-dialog.tsx` | settlement override | ✅ payment fields | not in billing-dialog |
| `bookings-list.tsx` | guest, room, dates | ❌ | no category/settlement columns |
| `bookings-calendar.tsx` | name, status | ❌ | no settlement |
| `guest-rooms-dashboard.tsx` | orchestrator | via checkout | mobile cards partial |
| `room-form.tsx` | ✅ rooms | N/A | state reset |

---

## 9. Server actions (24 exported)

| Action | Capability | Schema | Transaction | Critical gap |
|--------|------------|--------|-------------|--------------|
| `createBookingAction` | rooms.booking.write | createBookingSchema | — | room↔unit, host↔unit not verified |
| `updateBookingAction` | same | updateBookingSchema | — | lifecycle bypass via status |
| `checkInAction` | same | **none** | ❌ | bill insert errors ignored; ₹900 food |
| `checkOutAction` | same | **schema unused** | ❌ | **errors not checked** |
| `cancelBookingAction` | same | none | — | OK |
| `addBillItemAction` | same | createBillItemSchema | — | misc only in UI |
| `syncBarChitsToRoomBillAction` | — | — | — | **DOES NOT EXIST** |
| `recordRoomBillPaymentAction` | — | — | — | **DOES NOT EXIST** |
| `fetchHostProfilesAction` | rooms.read | — | — | **profiles RLS may block** |

---

## 10. Security gaps

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| SEC-01 | 🔴 High | SELECT RLS = any unit member, not `rooms.read` | Add capability to SELECT policies |
| SEC-02 | 🔴 High | `profiles` RLS blocks host picker for property_nco | Extend profiles_select or scoped RPC |
| SEC-03 | 🟡 Med | bar_chits.booking_id no unit match check | Trigger or app validation |
| SEC-04 | 🟡 Med | deleteBookingAction no lifecycle guard | Restrict to confirmed/cancelled |

---

## 11. Billing engine (`runMonthlyBillingAction`)

| Source | Current filter | Should be |
|--------|----------------|-----------|
| bar_chits | status=`signed` ❌ | status=`finalized`, profile_id NOT NULL, booking_id NULL |
| room_bills | settlement=CHARGE_TO_HOST, created_at in period ❌ | status=`transferred_to_mess_bill`, check_out_date in period |
| guest_meals | meal_date in period | + is_billed=false; mark billed after run |

---

## 12. REST API — planned (P1-API)

| Method | Path | Body / response | Capability |
|--------|------|-----------------|------------|
| GET | `/api/v1/guest-rooms/bookings` | `?unit_id&from&to` | rooms.read |
| POST | `/api/v1/guest-rooms/bookings` | createBookingSchema | rooms.booking.write |
| GET | `/api/v1/guest-rooms/bookings/:id` | BookingWithBill | rooms.read |
| PATCH | `/api/v1/guest-rooms/bookings/:id` | updateBookingSchema | rooms.booking.write |
| POST | `/api/v1/guest-rooms/bookings/:id/check-in` | — | rooms.booking.write |
| POST | `/api/v1/guest-rooms/bookings/:id/check-out` | checkOutBookingSchema | rooms.booking.write |
| GET | `/api/v1/guest-rooms/bills/:id` | room bill + items | rooms.read |
| PATCH | `/api/v1/guest-rooms/bills/:id` | draft items only | rooms.booking.write |

All routes: `withRoute`, idempotency on POST check-out.

---

## 13. Migration checklist

| Migration | On remote? | Action |
|-----------|------------|--------|
| `20260615000000_guest_rooms_saas_enhancements.sql` | **Verify** | Apply before Phase 1 test |
| **NEW** `20260616xxxxxx_schema_simplify_connections.sql` | No | Merge room_bills status; bar category; UNIQUE booking_id |
| `npm run db:types` | After apply | Regenerate + sync admin app |

---

## 14. Gap register (master log)

Priority: **P0** ship blocker · **P1** Phase 1 scope · **P2** later

| ID | Pri | Area | Gap | Fix task |
|----|-----|------|-----|----------|
| G-001 | P0 | Schema | Dual room_bills status | P1-MIG-01 |
| G-002 | P0 | Schema | No bar on room_bill_items | P1-MIG-02 |
| G-003 | P0 | Schema | No UNIQUE(room_bills.booking_id) | P1-MIG-02 |
| G-004 | P0 | Actions | checkOutAction ignores DB errors | P1-FIX |
| G-005 | P0 | Actions | No syncBarChitsToRoomBillAction | P1-BAR-01 |
| G-006 | P0 | Billing | bar status `signed` typo | P1-FIX-01 |
| G-007 | P1 | Actions | checkIn no transaction / silent item fail | P1-FIX |
| G-008 | P1 | Actions | checkOutBookingSchema not used | P1-FIX |
| G-009 | P1 | Config | Hardcoded ₹900 food | P1-FIX-03 |
| G-010 | P1 | UI | billing-dialog no bar lines | P1-UI-04 |
| G-011 | P1 | UI | list/calendar missing settlement | P1-UI-02 |
| G-012 | P1 | API | No REST routes | P1-API-01–05 |
| G-013 | P1 | Queries | Flat items double-count with orders | filter order_id IS NULL |
| G-014 | P1 | Queries | getBookings includes cancelled | add filter |
| G-015 | P1 | Zod | CHARGE_TO_HOST host refine on update | schema fix |
| G-016 | P1 | Zod | guest_email validation | schema fix |
| G-017 | P1 | Billing | Room rollup uses created_at not checkout | P1-FIX-02 |
| G-018 | P1 | Billing | No payment_status filter on room rollup | after MIG-01 |
| G-019 | P1 | Security | SELECT RLS not rooms.read | migration |
| G-020 | P1 | Security | profiles RLS blocks host picker | migration/RPC |
| G-021 | P2 | Booking | TD ref, service no, arrival time | new columns |
| G-022 | P2 | UI | room-form state reset | bugfix |
| G-023 | P2 | Tests | No action integration tests | test suite |
| G-024 | P1 | Actions | undoCheckOut stale payment fields | fix action |
| G-025 | P2 | Orders | createBillOrderAction no UI | Phase 1.5 |

---

## 15. Acceptance criteria (Phase 1 DoD)

- [ ] **G-001–G-006** resolved
- [ ] Flow A: guest pay — book → check-in → bar chit → checkout → paid folio
- [ ] Flow B: charge host — same with CHARGE_TO_HOST → transferred_to_mess_bill
- [ ] Dry-run monthly billing picks up Flow B room total for host
- [ ] API check-in from bearer token (mobile smoke test)
- [ ] All mutations pass capability + RLS on live unit
- [ ] No mock data in guest-rooms module

---

## 16. Test plan

| # | Scenario | Expected |
|---|----------|----------|
| T-01 | Create booking overlap | Error |
| T-02 | CHARGE_TO_HOST without host | Error create + update |
| T-03 | Check-in → 2 line items (rent + food) | draft bill |
| T-04 | Bar chit with booking_id | Appears on folio at checkout |
| T-05 | Direct checkout | payment_status paid, folio generated |
| T-06 | Host checkout | transferred_to_mess_bill |
| T-07 | Cancel confirmed | OK; cancel checked_in | Error |
| T-08 | API 403 without capability | 403 |

**Current:** `lib/guest-rooms/guest-rooms.test.ts` — schemas only.

---

## 17. Agent audit index

| Agent focus | Key finding |
|-------------|-------------|
| Bookings fields | 18 columns mapped; update host gap |
| room_bills | Dual status; undo bug |
| room_bill_items | ₹900; no bar; double-count |
| Bar integration | signed bug; no rollup |
| UI components | booking-form done; billing-dialog gaps |
| Queries/types | types aligned; query filters weak |
| Actions | 24 actions; checkout errors |
| Security | RLS read too broad; profiles block |
| Billing rollup | wrong date + status filters |
| Rooms/furniture | form state reset |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-09 | Initial multi-agent audit consolidated (10 agents) |
