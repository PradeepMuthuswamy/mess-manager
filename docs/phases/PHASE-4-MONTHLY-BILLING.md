# Phase 4 — Monthly Mess Billing: Compute Audit & Gap Register

> **Audit date:** 2026-09-09  
> **Foundation:** [`FOUNDATION.md`](../FOUNDATION.md) · **Master data:** aggregates sources; variant detail optional on output lines  
> **Schema:** MongoDB collections (`monthly_bills`, `monthly_bill_items`, `attendance_days`, `kitchen_expenditures`)  
> **Scope of this audit:** `lib/billing/compute.ts`, `lib/billing/compute.test.ts`, `runMonthlyBillingAction` in `lib/billing/actions.ts`, and rollup field matrices for **bar**, **subscriptions**, **misc debits**, **guest meals** (Phase 1 dependencies + `is_billed` patterns)

---

## 0. Executive summary

| Area | Ready | Gaps |
|------|-------|------|
| **Pure compute module** (`compute.ts`) | ~85% | Four exported functions; messing-only; not wired into billing action |
| **Unit tests** (`compute.test.ts`) | ~40% of engine | 8 tests, all passing; no integration tests for `runMonthlyBillingAction` |
| **Monthly billing action** | ~60% | All six bill components wired inline; known data-shape bugs; parties/arrears missing |
| **Bar rollup** | ~0% effective | Wrong enum + no finalize path → zero bar charges today |
| **Subscriptions rollup** | ~90% | Wired; all members get all subs (P4-G-010) |
| **Misc debits rollup** | ~75% | Wired + `is_billed`; re-run broken (P4-G-011); no UI (P4-G-022) |
| **REQ-BIL-10** (draft run) | ~70% | Workflow exists; engine bugs block trustworthy drafts |
| **UI** (`/billing`) | ~75% | Ops panel + member view wired; no draft bill list for secretary |

**Verdict:** `compute.ts` is a **clean, testable messing calculator** but is **mostly disconnected** from the production billing engine. `runMonthlyBillingAction` duplicates messing logic inline and owns all non-messing components. Phase 4 sprint 4.1 (P4-ENG-*) should consolidate on `compute.ts`, fix known query bugs, and add integration tests before the first live cycle.

---

## 1. Architecture split

```
lib/billing/compute.ts          ← Pure functions (messing + cycle helpers)
        │
        ├── used by: billing-ops-panel.tsx (deriveStandardBillingCycle only)
        └── NOT used by: runMonthlyBillingAction, lib/messing/actions.ts

lib/billing/actions.ts          ← runMonthlyBillingAction (full engine, inline logic)
lib/messing/actions.ts          ← P-rate snapshot on kitchen save (inline division, not calculateDailyPRate)
```

**Implication:** Changes to `compute.ts` do not affect live billing until `runMonthlyBillingAction` is refactored to call it (P4-ENG-02).

---

## 2. `compute.ts` — function algorithms

### 2.1 `calculateDailyPRate(morningExp, afternoonExp, dinnerExp, presentCount)`

**Purpose:** Derive daily P-rate (P_d) for P-register billing.

**Algorithm:**

1. If `presentCount <= 0` → return `0`.
2. `total = morningExp + afternoonExp + dinnerExp`.
3. If `total <= 0` → return `0`.
4. Return `round((total / presentCount) * 10000) / 10000` (4 decimal places).

**Formula (REQ-MES / glossary):**

```
P_d = (Morning + Afternoon + Dinner Kitchen Expenditure) / Total Diners Present
```

**Example:** ₹200 + ₹350 + ₹311 = ₹861 ÷ 100 diners = **₹8.61**.

**Production usage:** Duplicated inline in `lib/messing/actions.ts` (`recordDailyKitchenExpenditureAction`, line ~193) — does **not** import this function.

---

### 2.2 `calculateCycleDates(startDate, endDate)`

**Purpose:** Enumerate every calendar day in a billing window (inclusive).

**Algorithm:**

1. Parse ISO date strings to `Date` objects.
2. Loop from `start` to `end`, pushing `format(cur, 'yyyy-MM-dd')` each iteration.
3. Advance with `addDays(cur, 1)`.

**Example:** `2026-04-26` → `2026-05-25` yields **30 dates**.

**Production usage:** Duplicated inline in `runMonthlyBillingAction` (lines ~257–264) — does **not** import this function.

---

### 2.3 `deriveStandardBillingCycle(billingYear, billingMonth)`

**Purpose:** Derive the standard Indian Armed Forces **26th-to-25th** cycle metadata.

**Algorithm:**

1. **End date:** 25th of `billingMonth` in `billingYear`.
2. **Start date:** 26th of the previous calendar month (via `subMonths(end, 1)` then day 26).
3. **Due date:** 10th of the month **after** `billingMonth` (`new Date(billingYear, billingMonth, 10)` — JS month indexing).
4. **Name:** `"{MonthName} {billingYear} Mess Bill"`.

**Examples:**

| billingYear | billingMonth | startDate | endDate | dueDate | name |
|-------------|--------------|-----------|---------|---------|------|
| 2026 | 5 (May) | 2026-04-26 | 2026-05-25 | 2026-06-10 | May 2026 Mess Bill |
| 2026 | 1 (Jan) | 2025-12-26 | 2026-01-25 | 2026-02-10 | January 2026 Mess Bill |

**Production usage:** Used by `BillingOpsPanel` when opening a new period. **Not** used when setting `due_date` on generated bills (see P4-G-008).

---

### 2.4 `calculateMemberMessingCycle(params)`

**Purpose:** Pure per-member messing total across a billing cycle.

**Inputs:**

| Param | Role |
|-------|------|
| `billingMode` | `P_REGISTER_SPLIT` or `FLAT_RATE` |
| `cycleDates` | Array of ISO date strings |
| `isAbsentOnDate(date)` | Skip day if member absent |
| `pRates` | `Map<date, rate>` for P-register mode |
| `flatRatesOnDate(date)` | Per-meal rates for flat mode |
| `isMealCut(date, mealType)` | Skip meal if cut approved |

**Algorithm:**

```
total = 0
items = []

for each dateStr in cycleDates:
  if isAbsentOnDate(dateStr): continue

  if billingMode == P_REGISTER_SPLIT:
    pRate = pRates.get(dateStr) ?? 0
    if pRate > 0:
      total += pRate
      items.push({ date, description: "Daily Messing (P-Rate) for {date}", amount: pRate })

  else FLAT_RATE:
    for meal in [breakfast, lunch, dinner]:
      if not isMealCut(dateStr, meal):
        rate = flatRatesOnDate(dateStr)[meal] ?? 0
        if rate > 0:
          total += rate
          items.push({ date, description: "Messing - {MEAL} ({date})", amount: rate })

return { total: round(total * 100) / 100, items }
```

**Notes:**

- Only **breakfast, lunch, dinner** are billed in flat mode. Tea and packed meals are excluded (matches `runMonthlyBillingAction`).
- Zero rates produce no line items.
- Absent days produce no charge.

**Production usage:** **Not imported** by `runMonthlyBillingAction`. Logic is duplicated inline (lines ~291–343) with equivalent behaviour but different absence fallback (see P4-G-005).

---

## 3. Bill component algorithms (`runMonthlyBillingAction`)

The production engine lives in `lib/billing/actions.ts`. It fetches operational data once, then loops every unit member.

### 3.1 Messing

| Mode | Algorithm | Source tables |
|------|-----------|---------------|
| **P_REGISTER_SPLIT** | Sum `mess_daily_p_rates.rate_per_diner` for each cycle day member is present | `mess_daily_p_rates`, `attendance_days`, `attendance_absences`, `profiles.dining_in` |
| **FLAT_RATE** | Sum active flat rates for breakfast/lunch/dinner minus approved meal cuts | `messing_flat_rates` (via `getActiveFlatRates`), `mess_meal_cuts`, attendance |

**Presence rule:**

```
attDay = attendance_days row for dateStr
isAbsent = attDay ? absenteeSet.has(day_id:profile_id) : !member.dining_in
```

If no attendance day exists, member is treated as absent unless `dining_in = true` (then present). This differs from `calculateMemberMessingCycle`, which relies entirely on the injected `isAbsentOnDate` callback.

**Line item:** One row per charged day (P-rate) or per charged meal (flat).

---

### 3.2 Bar

**Algorithm:** Sum `bar_chits.total_amount` where `profile_id = member.id` and `date` in `[start_date, end_date]`.

**Current filter:** `status = 'signed'` ❌ (`lib/billing/actions.ts:162`)

**Schema reality:** `bar_chits.status` enum is `'pending' | 'finalized'` (`20260605000000_bar_chits.sql`). No `'signed'` value exists.

**Expected (REQ-BIL §11.2, REQ-BAR-05, P1-FIX-01):** `status = 'finalized'`, `profile_id IS NOT NULL`, `booking_id IS NULL`.

**Field matrix — source `bar_chits` → mess bill:**

| Source field | Type | Query filter (current) | Query filter (required) | Line item mapping | Gap |
|--------------|------|------------------------|-------------------------|-------------------|-----|
| `id` | uuid | — | — | `mess_bill_line_items.reference_id` | ✅ |
| `unit_id` | uuid | `= unit_id` | same | — | ✅ |
| `date` | date | `gte start`, `lte end` | same | `item_date` | ✅ |
| `profile_id` | uuid nullable | skip if null in loop | `IS NOT NULL` in query | member bucket key | ⚠️ post-filter only |
| `booking_id` | uuid nullable | **not filtered** | `IS NULL` | — | **P4-G-018** double-count with room |
| `total_amount` | numeric(12,2) | — | — | `amount`, `unit_rate`; sums `bar_amount` | ✅ |
| `status` | text | `'signed'` ❌ | `'finalized'` | — | **P4-G-001** |
| `guest_name` | text | — | — | not used in description | cosmetic |
| `created_by` | uuid | — | — | — | — |

**Line item shape (current):**

| Line field | Value |
|------------|-------|
| `category` | `'bar'` |
| `item_date` | `bar_chits.date` |
| `description` | `Bar Chit ({date})` |
| `quantity` | `1` |
| `unit_rate` | `total_amount` |
| `amount` | `total_amount` |
| `reference_id` | `bar_chits.id` |

**Phase 1 dependency:** Bar rollup routing (`booking_id → room folio`, `profile_id → mess bill`) is documented in [`PHASE-1-GUEST-ROOMS.md`](./PHASE-1-GUEST-ROOMS.md) §5. P1-BAR-01 syncs guest chits to room folio; P1-FIX-01 fixes the enum typo. **Additional blocker:** no `finalizeBarChitAction` exists — `createBarChitCore` always inserts `status: 'pending'` (`lib/bar/actions.ts:112`). Even after P4-G-001 fix, engine returns **zero bar** until finalize workflow ships (**P4-G-019**).

---

### 3.3 Guest rooms

**Algorithm:** Sum `room_bills.total_amount` where booking's `host_profile_id = member.id`.

**Current filters:**

- `settlement_type = 'CHARGE_TO_HOST'`
- `created_at` between period start/end timestamps

**Expected (PHASE-1 §11, P1-FIX-02):**

- `status = 'transferred_to_mess_bill'` (after schema merge)
- Roll up by `check_out_date` in period, not `created_at`
- Mark room bill as billed / prevent double-count on re-run

---

### 3.4 Casual guest meals

**Algorithm:** Sum `guest_meals.total_amount` where `host_profile_id = member.id` and `meal_date` in period.

**Field matrix — source `guest_meals` → mess bill:**

| Source field | Type | Query filter | Line item mapping | Gap |
|--------------|------|--------------|-------------------|-----|
| `id` | uuid | — | `reference_id` | ✅ |
| `unit_id` | uuid | `= unit_id` | — | ✅ |
| `host_profile_id` | uuid | member bucket key | — | ✅ |
| `meal_date` | date | `gte start`, `lte end` | `item_date` | ✅ |
| `meal_type` | messing_meal_type | — | in description | ✅ |
| `guest_count` | int | — | `quantity` | ✅ |
| `rate_charged` | numeric | — | `unit_rate` | ✅ |
| `total_amount` | numeric | — | `amount`; sums `guest_meal_amount` | ✅ |
| `guest_names` | text | — | not in description | cosmetic |
| `notes` | text | — | — | — |
| **`is_billed`** | — | **column absent** | — | **P4-G-009** |

**Line item shape:** `Guest Dining: {guest_count} guest(s) ({meal_type})`.

**Phase 1 dependency:** None — table lives in Phase 3/4 migration (`20260614000000`). Casual guest capture is Mess Havildar (`/messing`).

---

### 3.5 Subscriptions

**Algorithm:** For **every** unit member, add **every** active `mess_subscriptions` row (`is_active = true`).

**Field matrix — source `mess_subscriptions` → mess bill:**

| Source field | Type | Query filter | Line item mapping | Gap |
|--------------|------|--------------|-------------------|-----|
| `id` | uuid | — | `reference_id` | ✅ |
| `unit_id` | uuid | `= unit_id` | — | ✅ |
| `name` | text | — | `Subscription: {name}` | ✅ |
| `description` | text | — | not used | cosmetic |
| `amount` | numeric(12,2) | — | `amount`, `unit_rate`; sums `subscriptions_amount` | ✅ |
| `is_active` | boolean | `= true` | — | ✅ no effective-date filter |
| `created_at` / `updated_at` | timestamptz | — | — | — |
| **enrollment** | — | **no join table** | applied to all members | **P4-G-010** |
| **`is_billed`** | — | **column absent** | re-run OK (stateless) | see §3C |

**Line item shape:** dated `end_date` (period end), not subscription effective date.

**Re-run behaviour:** Subscriptions are **stateless** — no `is_billed` flag. Re-run deletes/recreates bills, so each run re-applies all active subscriptions once per member bill. Idempotent for drafts; **not** idempotent across published periods (same subscription charged every month — by design).

**UI:** `createSubscriptionAction` wired in `BillingOpsPanel`; no edit/deactivate UI (**P4-G-020**).

**Phase 1 dependency:** None.

---

### 3.6 Miscellaneous debits

**Algorithm:** Sum `mess_misc_debits` where `profile_id = member.id`, `is_billed = false`, `charge_date <= end_date`.

**Post-run:** Sets `is_billed = true` on included debits (`actions.ts:467–472`).

**Field matrix — source `mess_misc_debits` → mess bill:**

| Source field | Type | Query filter | Line item mapping | Gap |
|--------------|------|--------------|-------------------|-----|
| `id` | uuid | — | `reference_id` | ✅ |
| `unit_id` | uuid | `= unit_id` | — | ✅ |
| `profile_id` | uuid | member bucket key | — | ✅ |
| `charge_date` | date | `<= end_date` only | `item_date` | **P4-G-021** no `>= start_date` |
| `category` | enum text | — | not on line item | audit gap |
| `description` | text | — | `Recovery: {description}` | ✅ |
| `amount` | numeric | — | `amount`, `unit_rate`; sums `misc_amount` | ✅ |
| `receipt_ref` | text | — | not on line item | audit gap |
| `is_billed` | boolean | `= false` | flipped `true` post-run | **P4-G-011** no unmark |
| `created_by` | uuid | — | — | — |

**Line item shape:** `Recovery: {description}` on `charge_date`.

**Pre-period carry-forward:** Unbilled debits with `charge_date < start_date` are **included** (intentional carry-forward per mess practice; document in unit config).

**UI:** `createMiscDebitAction` exists; **no billing UI** to add misc debits (**P4-G-022**). Secretary must use direct DB or future form.

**Phase 1 dependency:** None.

---

### 3A. Phase 1 → Phase 4 dependency matrix (finalized)

Bar and room rollups **cannot be trusted** until Phase 1 deliverables land:

| Phase 1 task | Blocks P4 component | Current state | P4 gap if missing |
|--------------|----------------------|---------------|-------------------|
| **P1-MIG-01** | Room rollup status filter | Dual `status` / `payment_status` on `room_bills` | **P4-G-003** |
| **P1-MIG-02** | Bar-on-folio routing | No `bar` category on `room_bill_items` | **P4-G-018** (room+bar double-count) |
| **P1-FIX-01** | Bar mess rollup | `status = 'signed'` typo | **P4-G-001** |
| **P1-FIX-02** | Room date filter | Uses `created_at` not `check_out_date` | **P4-G-002** |
| **P1-BAR-01** | Guest bar → room folio | `syncBarChitsToRoomBillAction` missing | Guest chits orphan; may hit mess bill if `booking_id` unset |
| **P1-BAR-02** | Bar finalize workflow | No finalize action | **P4-G-019** — all chits stay `pending` |
| **P1-UI-05** | Host checkout → `transferred_to_mess_bill` | Partially in `checkOutAction` via `payment_status` | Room bills never match P4 filter until MIG-01 |

**Routing rule (from [`FOUNDATION.md`](../FOUNDATION.md) §4):**

```
bar_chits.booking_id IS NOT NULL  → room folio (exclude from mess bar bucket)
bar_chits.profile_id IS NOT NULL  → mess bill bar bucket (finalized only)
guest_meals / room_bills          → mess bill via host_profile_id
mess_misc_debits                  → mess bill via profile_id + is_billed gate
mess_subscriptions                → mess bill flat levy (all members)
```

**Phase 4 can ship subscriptions + misc independently** of Phase 1 once migration `20260614000000` is applied. **Bar + room components are blocked** on P1-MIG/FIX/BAR tasks above.

---

### 3B. `is_billed` and idempotency pattern register

How each bill input handles **draft re-run** (delete bills → recalculate):

| Source table | Has `is_billed`? | Post-run mutation | Re-run before publish | Cross-period risk |
|--------------|------------------|-------------------|----------------------|-------------------|
| `bar_chits` | ❌ | none | ✅ idempotent (date filter) | Same chit in one period only |
| `room_bills` | ❌ | none | ⚠️ re-includes same bills | **Double-count** if prior period published without status gate |
| `guest_meals` | ❌ | none | ❌ **re-includes all rows** | **P4-G-009** |
| `mess_subscriptions` | ❌ | none | ✅ idempotent (stateless monthly levy) | Correct monthly re-charge |
| `mess_misc_debits` | ✅ | `is_billed = true` | ❌ **skips marked rows** | **P4-G-011** |
| `mess_bills` | — | deleted on re-run | ✅ | — |

**Recommended pattern (align misc + guest meals):**

```sql
-- Option A: add is_billed + billing_period_id to guest_meals (mirror misc)
ALTER TABLE guest_meals ADD COLUMN is_billed boolean NOT NULL DEFAULT false;
ALTER TABLE guest_meals ADD COLUMN billed_period_id uuid REFERENCES mess_billing_periods(id);

-- Option B: on draft delete, unmark misc debits referenced by deleted line items
UPDATE mess_misc_debits SET is_billed = false
WHERE id IN (
  SELECT reference_id FROM mess_bill_line_items
  WHERE bill_id IN (SELECT id FROM mess_bills WHERE billing_period_id = $1)
    AND category = 'misc'
);
```

**PHASE-1 spec expectation** ([`PHASE-1-GUEST-ROOMS.md`](./PHASE-1-GUEST-ROOMS.md) §11): guest meals should use `is_billed=false` filter + mark after run — **not implemented**.

---

### 3.7 Parties

**Requirement (REQ-BIL §11.2):** Individual party settlement.

**Status:** **Not implemented** — no query, no line item category (P4-G-012).

---

### 3.8 Arrears

**Requirement (REQ-BIL §11.2):** Prior unpaid balance.

**Status:** Hardcoded `arrears_amount: 0` on every bill (P4-G-013). Deferred to Phase 6 per parent plan §4.4.

---

### 3.9 Bill total

```
total = messing + bar + room + guest_meal + subscriptions + misc + arrears
```

Each category rounded to 2 dp; `status = 'draft'`; bill number `MB-{year}-{month}-{seq}`.

**Idempotent re-run:** Deletes existing `mess_bills` for the period, inserts fresh drafts + line items (P4-ENG-06 partial — misc debit unmark missing).

---

## 4. Test coverage (`compute.test.ts`)

**Run:** `npm test -- lib/billing/compute.test.ts` — **8/8 passing** (2026-09-09).

### 4.1 Coverage matrix

| Function | Tests | Cases covered | Not covered |
|----------|-------|---------------|-------------|
| `calculateDailyPRate` | 3 | Exact example (8.61); zero diners; zero expenses | Negative inputs; rounding edge (e.g. 1/3); presentCount = 1 |
| `deriveStandardBillingCycle` | 2 | May 2026 cycle; January year boundary | February leap year; billingMonth 12 → due date year roll; configurable due date (REQ-BIL-02) |
| `calculateCycleDates` | 1 | 30-day Apr26–May25 window | Single-day range; start > end; timezone edge |
| `calculateMemberMessingCycle` | 2 | P-register with absence; flat rate with dinner cut | All days absent; zero pRate days; multiple meal cuts; tea/packed meals; total rounding edge; item amount assertions (P-register) |

### 4.2 Engine tests (missing)

| Target | Status |
|--------|--------|
| `runMonthlyBillingAction` | ❌ No tests |
| Bar rollup filter | ❌ |
| Room bill date/filter | ❌ |
| Misc debit re-run idempotency | ❌ |
| Multi-member bill generation | ❌ |
| Integration: compute → action refactor | ❌ |

**Overall test coverage of billing engine:** ~15% (messing pure functions only).

---

## 5. REQ-BIL-10 compliance

**Requirement:** *Open billing period → run calculation engine → **draft** bills per member*

| Step | Implementation | Status |
|------|----------------|--------|
| Open billing period | `createBillingPeriodAction` → `mess_billing_periods.status = 'open'` | ✅ |
| Run calculation engine | `runMonthlyBillingAction` via `BillingOpsPanel` "Run Monthly Billing Engine" | ✅ |
| Draft bills per member | Inserts `mess_bills` with `status = 'draft'` + `mess_bill_line_items` | ✅ |
| Period → draft status | Updates period to `status = 'draft'` after run | ✅ |
| Capability gate | `billing.draft` on create + run | ✅ |
| Trustworthy totals | Bar/room query bugs; no party; arrears stub | ⚠️ Partial |
| One bill per member per period | Loop all `profiles` in unit — no unique constraint enforced in action | ⚠️ |
| Granular line items (REQ-BIL-15) | Written to `mess_bill_line_items` with category + reference_id | ✅ |
| Re-run before publish | Deletes prior drafts; misc debit unmark incomplete | ⚠️ |

**REQ-BIL-10 verdict:** Workflow **implemented**; calculation **not production-ready** until P4-G-001–006 resolved.

---

## 6. P4-G gap register

Priority: **P0** ship blocker · **P1** Phase 4 scope · **P2** deferred

| ID | Pri | Area | Gap | Fix task |
|----|-----|------|-----|----------|
| **P4-G-001** | P0 | Bar | `status = 'signed'` — invalid enum; returns zero bar charges | P4-ENG-03 / P1-FIX-01 |
| **P4-G-002** | P0 | Rooms | Rollup uses `created_at`, not `check_out_date` | P4-ENG-04 / P1-FIX-02 |
| **P4-G-003** | P0 | Rooms | No `transferred_to_mess_bill` / status filter | P4-ENG-04 / P1-MIG-01 |
| **P4-G-004** | P0 | Schema | Billing migration likely not applied to remote | Verify + apply |
| **P4-G-005** | P1 | Messing | `runMonthlyBillingAction` duplicates `calculateMemberMessingCycle`; absence fallback differs | P4-ENG-02 — refactor to import compute |
| **P4-G-006** | P1 | Messing | `calculateDailyPRate` not used by kitchen save action | Import in `lib/messing/actions.ts` |
| **P4-G-007** | P1 | Messing | P-rate used even if register not approved (P3-APP-03) | Block unapproved days in billing |
| **P4-G-008** | P1 | Cycle | Due date uses `format(addDays(end, 16), 'yyyy-MM-10')` — fragile vs `deriveStandardBillingCycle` | Use shared helper; REQ-BIL-02 config |
| **P4-G-009** | P1 | Guest meals | No `is_billed`; re-run double-counts | Add column or period-scoped dedup |
| **P4-G-010** | P1 | Subscriptions | All members get all active subscriptions | Confirm domain rule; optional enrollment table |
| **P4-G-011** | P1 | Misc | Re-run does not unmark `is_billed` on misc debits | Reset on draft delete or track `billing_period_id` |
| **P4-G-012** | P1 | Parties | Component missing entirely | New query + line category (Phase 5?) |
| **P4-G-013** | P2 | Arrears | Always `0` | Phase 6 per plan §4.4 |
| **P4-G-014** | P1 | Members | Bills all unit profiles, not `dining_in` only | Filter or zero messing for non-diners |
| **P4-G-015** | P1 | Tests | No `runMonthlyBillingAction` tests | P4-TST-01 |
| **P4-G-016** | P1 | UI | Secretary cannot list draft bills before publish | P4-UI-01 / P4-UI-02 |
| **P4-G-017** | P2 | API | No `/api/v1/billing/*` routes | Post Phase 4 |
| **P4-G-018** | P1 | Bar | Room-attached bar chits may double-count (room + bar) | Exclude `booking_id IS NOT NULL`; needs P1-MIG-02 |
| **P4-G-019** | P0 | Bar | No finalize workflow — all chits stay `pending` | P1-BAR-02 / `finalizeBarChitAction` + `bar.finalize` cap |
| **P4-G-020** | P2 | Subscriptions | No edit/deactivate UI for `mess_subscriptions` | Billing ops panel toggle |
| **P4-G-021** | P2 | Misc | Pre-period unbilled debits roll in (`charge_date <= end` only) | Document as feature or add `>= start_date` |
| **P4-G-022** | P1 | Misc | No UI for `createMiscDebitAction` | Billing ops misc-debit form |

### 6.1 Component readiness (bar · subscriptions · misc)

| Component | Query wired | Field mapping | Phase 1 deps | Re-run safe | Ship blocker |
|-----------|-------------|---------------|--------------|-------------|--------------|
| **Bar** | ⚠️ wrong enum | ✅ | P1-FIX-01, P1-BAR-02, P1-MIG-02 | ✅ (date filter) | **P4-G-001, P4-G-019** |
| **Subscriptions** | ✅ | ✅ | none | ✅ (stateless) | P4-G-010 (domain confirm) |
| **Misc debits** | ✅ | ✅ | none | ❌ P4-G-011 | P4-G-011, P4-G-022 |
| **Guest meals** | ✅ | ✅ | none | ❌ P4-G-009 | P4-G-009 |

---

## 7. Sprint task mapping (P4-ENG / P4-UI / P4-TST)

| Sprint task | Gap IDs addressed |
|-------------|-------------------|
| P4-ENG-01 | This audit |
| P4-ENG-02 | P4-G-005, P4-G-006 |
| P4-ENG-03 | P4-G-001, P4-G-018, P4-G-019 |
| P4-ENG-04 | P4-G-002, P4-G-003 |
| P4-ENG-05 | P4-G-009, P4-G-010, P4-G-020 |
| P4-ENG-06 | P4-G-011, P4-G-022 |
| P4-UI-01–02 | P4-G-016 |
| P4-TST-01 | P4-G-015 + reconciliation checklist |

---

## 8. Recommended refactor (P4-ENG-02)

Extract a testable `compileMemberBill(params)` in `lib/billing/compute.ts`:

```typescript
// Proposed shape — not yet implemented
export function compileMemberBill(input: {
  memberId: string;
  cycleDates: string[];
  billingMode: MessingBillingMode;
  // ... component slices: barChits, roomBills, guestMeals, subscriptions, miscDebits
  isAbsentOnDate: (date: string) => boolean;
  pRates: Map<string, number>;
  flatRatesOnDate: (date: string) => Record<MessingMealType, number>;
  isMealCut: (date: string, meal: MessingMealType) => boolean;
}): { categoryTotals; lineItems; totalAmount }
```

`runMonthlyBillingAction` becomes: fetch data → map to pure input → persist results.

---

## 9. Acceptance criteria cross-check (Phase 4 DoD)

| Criterion | Blocked by |
|-----------|------------|
| One full billing period published on live unit | P4-G-001–004 |
| ≥3 members confirm bill matches expectations | Engine fixes + P4-LIVE-02 |
| Secretary can re-run before publish | P4-G-011 |
| Payment recorded for at least one member | ✅ `markBillPaidAction` exists |
| No mock data on `/billing` | ✅ Real queries wired |

---

## 10. File reference

| File | Role |
|------|------|
| `/Users/pradeepmuthuswamy/Projects/mess-manager/lib/billing/compute.ts` | Pure calculation helpers |
| `/Users/pradeepmuthuswamy/Projects/mess-manager/lib/billing/compute.test.ts` | Unit tests (8 cases) |
| `/Users/pradeepmuthuswamy/Projects/mess-manager/lib/billing/actions.ts` | Production billing engine |
| `/Users/pradeepmuthuswamy/Projects/mess-manager/lib/messing/actions.ts` | P-rate snapshot on kitchen save |
| `/Users/pradeepmuthuswamy/Projects/mess-manager/app/(app)/billing/_components/billing-ops-panel.tsx` | Secretary run/publish UI |

---

## 11. Phase 1 Guest Rooms → Phase 4 Rollup Audit

> **Cross-ref:** [`PHASE-1-GUEST-ROOMS.md`](./PHASE-1-GUEST-ROOMS.md) §1, §11, §14 · [`FOUNDATION.md`](../FOUNDATION.md) §4  
> **Code:** `lib/billing/actions.ts` lines 157–214 (bar fetch), 178–214 (room fetch), 345–375 (member compile) · `lib/guest-rooms/actions.ts` `checkOutAction` lines 428–498

### 11.1 Connection model (intended routing)

```
bookings.host_profile_id + settlement_type = CHARGE_TO_HOST
        │
        ▼ checkout (checkOutAction)
room_bills.total_amount  ← sum(room_bill_items: rent, food, adhoc, misc [, bar when P1-BAR-01])
room_bills.payment_status = transferred_to_mess_bill   (dual status — see P1-MIG-01)
        │
        ▼ runMonthlyBillingAction
mess_bills.room_amount   ← one line per room_bill, reference_id = room_bills.id
mess_bill_line_items.category = 'room'

bar_chits.booking_id set  →  room folio only (NOT member bar bucket)
bar_chits.profile_id set  →  member bar bucket (NOT room folio)
```

Phase 4 reads **only** `room_bills.total_amount` for the room bucket. It does **not** join `room_bill_items`, `bookings.check_out_date` (for filtering), or `bar_chits`.

---

### 11.2 Current implementation — exact filters

#### Bar chits (step 7 → member `bar_amount`)

| Filter | Value in code | Source field |
|--------|---------------|--------------|
| Unit | `.eq('unit_id', unit_id)` | `bar_chits.unit_id` |
| Status | `.eq('status', 'signed')` ❌ | `bar_chits.status` — schema allows `'pending' \| 'finalized'` only |
| Date window | `.gte('date', start_date).lte('date', end_date)` | `bar_chits.date` (consumption date) |
| Member key | `chit.profile_id` (skip if null) | `bar_chits.profile_id` |
| Booking exclusion | **none** ❌ | `bar_chits.booking_id` not filtered |
| Finalize gate | **none** — chits stay `'pending'` forever | `createBarChitCore` never sets `'finalized'` |

**Select:** `id, profile_id, total_amount, date`

#### Room bills (step 8 → member `room_amount`)

| Filter | Value in code | Source field |
|--------|---------------|--------------|
| Unit | `.eq('unit_id', unit_id)` | `room_bills.unit_id` |
| Settlement | `.eq('settlement_type', 'CHARGE_TO_HOST')` | `room_bills.settlement_type` (copied at checkout from booking) |
| Date window | `.gte('created_at', start_dateT00:00:00Z).lte('created_at', end_dateT23:59:59Z)` ❌ | `room_bills.created_at` (check-in time, not checkout) |
| Transfer gate | **none** ❌ | `room_bills.payment_status` / unified `status` not checked |
| Direct settlement | Excluded by settlement filter ✅ | `DIRECT_SETTLEMENT` folios never roll up |
| Member key | `booking.host_profile_id` via inner join | `bookings.host_profile_id` |
| Re-run idempotency | **none** ❌ | No `is_billed` or `billing_period_id` on `room_bills` |

**Select:** `id, total_amount, settlement_type`, nested `bookings(id, host_profile_id, guest_name, check_out_date, room.name)`

**Line item date:** `booking.check_out_date ?? start_date` (display only — query still uses `created_at`)

#### Per-member compile (step 12C)

```typescript
// lib/billing/actions.ts ~361–375
for (const rb of memberRoomBills.get(member.id) ?? []) {
  roomAmount += rb.amount;  // rb.amount = room_bills.total_amount
  // category: 'room', reference_id: room_bills.id
}
```

---

### 11.3 Expected filters (after P1 + P4 fixes)

| Component | Correct filter | Rationale |
|-----------|----------------|-----------|
| **Bar — member** | `status = 'finalized'`, `profile_id IS NOT NULL`, `booking_id IS NULL`, `date` in cycle | Member consumption only; exclude in-house guest bar routed to folio |
| **Bar — guest folio** | `booking_id IS NOT NULL` | Rolled into `room_bills` at checkout via `syncBarChitsToRoomBillAction` (P1-BAR-01) — **never** queried directly by Phase 4 |
| **Room — host charge** | `settlement_type = 'CHARGE_TO_HOST'`, `status = 'transferred_to_mess_bill'` (post P1-MIG-01), `bookings.check_out_date` in `[start_date, end_date]` | Bill belongs to cycle when guest **departs**, not when folio opens at check-in |
| **Room — re-run** | Mark `room_bills.billing_period_id` or `is_billed = true` after inclusion; reset on draft delete | Mirror `mess_misc_debits.is_billed` pattern |

---

### 11.4 Field dependencies

| Phase 4 reads | Depends on (Phase 1) | Set by | If missing/wrong |
|---------------|----------------------|--------|------------------|
| `room_bills.total_amount` | `room_bill_items` sum at checkout | `checkOutAction` L449–450, L485 | Under/over charge; bar not included until P1-BAR-01 |
| `room_bills.settlement_type` | `bookings.settlement_type` (override at checkout) | `checkOutAction` L452–453, L486–487 | Wrong routing (direct vs host) |
| `bookings.host_profile_id` | Required when `CHARGE_TO_HOST` | `createBookingAction` (create only); checkout re-validates | Room bill skipped in rollup (`if booking?.host_profile_id`) |
| `bookings.check_out_date` | Planned billing period key | Booking form / `actual_check_out` at checkout | **Not used for filtering today** — period mis-assignment |
| `room_bills.payment_status` | `transferred_to_mess_bill` for host path | `checkOutAction` L468, L487 | Draft/direct folios could roll up without gate |
| `room_bills.created_at` | Check-in timestamp | `checkInAction` bill insert | **Wrong period filter today** — May bill in check-in month not checkout month |
| `bar_chits.profile_id` | Member chits only | `createBarChitCore` when `consumer_type = 'member'` | Null → skipped from bar bucket |
| `bar_chits.booking_id` | Guest in-house bar | `createBarChitCore` when `consumer_type = 'guest'` | Should route to folio, not bar bucket — **no exclusion filter today** |
| `bar_chits.status` | Must be `'finalized'` for billing | **No finalize action exists** | Engine uses invalid `'signed'` → zero bar charges |

#### Checkout → folio total formula (Phase 1 today)

```
total = Σ (room_bill_items.amount × quantity)
```

Default check-in items: `room_rent` (`rooms.nightly_rate × nights`) + `food` (hardcoded ₹900 × nights). Adhoc/misc via `addBillItemAction`. **Bar chits with `booking_id` are not synced** — `syncBarChitsToRoomBillAction` does not exist (G-005).

---

### 11.5 Double-count risks — bar on folio

| Scenario | Today | After P1-BAR-01 (bar → room_bill_items) | Mitigation |
|----------|-------|----------------------------------------|------------|
| **A. Guest bar on folio + member bar query** | Guest chit has `booking_id`, `profile_id = null` → not in bar bucket. Room total excludes bar. **No double-count; bar lost from both bills.** | Bar copied to `room_bill_items` (category `bar`); `room_bills.total_amount` includes bar. If bar query still lacks `booking_id IS NULL` filter and chit also has `profile_id` → **double-count** (room + bar lines). | Bar bucket: `booking_id IS NULL`. Guest bar never sets `profile_id` (`createBarChitCore` L108–110). |
| **B. Host personal bar + host room charge** | Separate: `profile_id = host`, `booking_id = null` → bar bucket; room via `host_profile_id` → room bucket. **Correct, no overlap.** | Same if routing rules hold. | — |
| **C. CHARGE_TO_HOST stay, guest bar synced to folio** | Room rollup picks `total_amount` (rent+food only). Guest bar invisible on mess bill. **Under-count.** | Room rollup picks `total_amount` (rent+food+bar). **Correct single charge** if bar not also in bar bucket. | Phase 4 must **never** query `bar_chits` where `booking_id IS NOT NULL`. |
| **D. DIRECT_SETTLEMENT with host assigned** | Excluded by `settlement_type = CHARGE_TO_HOST` filter even if `host_profile_id` set. **Correct** (see `guest-rooms.test.ts` bill-2). | Same. | Keep settlement filter. |
| **E. Re-run monthly billing** | All matching `room_bills` re-included every run (no `is_billed`). Misc debits marked; room bills not. **Double-count on re-run.** | Same until billing-period marker added. | Add `room_bills.billing_period_id` or `is_billed`; unmark on draft delete (P4-G-011 pattern). |
| **F. Room food line vs guest_meals** | Check-in adds `food` line on folio; `guest_meals` is separate casual-dining path. Different tables — **no engine double-count**, possible business duplicate if clerk records both. | Same. | Ops training; optional booking_id on guest_meals later. |

**Critical path after bar folio sync:**

```
IF bar_chits.booking_id IS NOT NULL
  → amount flows ONLY via room_bills.total_amount → mess_bills.room_amount
ELSE IF bar_chits.profile_id IS NOT NULL
  → amount flows ONLY via mess_bills.bar_amount
```

Violating this bifurcation is the primary double-count (or under-count) failure mode.

---

### 11.6 P4-G ↔ P1-G overlap matrix

| P4-G ID | P1-G ID | Shared issue | Owner | Fix task |
|---------|---------|--------------|-------|----------|
| **P4-G-001** | **G-006** | `bar_chits.status = 'signed'` — invalid enum, zero bar charges | Phase 4 engine | P4-ENG-03 / P1-FIX-01 → `'finalized'` |
| **P4-G-018** | **G-002**, **G-005** | Room-attached bar may double-count once folio sync ships | Phase 1 bar + Phase 4 filter | P1-BAR-01 + `booking_id IS NULL` on bar query |
| **P4-G-002** | **G-017** | Room rollup uses `created_at` not `check_out_date` | Phase 4 engine | P4-ENG-04 / P1-FIX-02 |
| **P4-G-003** | **G-001**, **G-018** | No `transferred_to_mess_bill` gate on room rollup | Phase 1 schema + Phase 4 | P1-MIG-01 merge status, then filter in engine |
| — | **G-005** | `syncBarChitsToRoomBillAction` missing — bar never on folio | Phase 1 only | P1-BAR-01 (blocks correct room totals) |
| — | **G-004** | `checkOutAction` ignores DB errors — folio may not finalize | Phase 1 only | P1-FIX (blocks trustworthy rollup input) |
| — | **G-013** | Flat items + nested orders double-count in UI | Phase 1 queries | Does not affect engine (uses `total_amount`) |
| P4-G-009 | — | `guest_meals` re-run double-count | Phase 4 only | P4-ENG-05 |
| P4-G-011 | — | Misc debit unmark on re-run | Phase 4 only | P4-ENG-06; extend pattern to room bills |

**Ship order:** P1-MIG-01 (status merge) → P1-BAR-01 (folio sync) → P4-ENG-03/04 (filters) → P4-ENG-06 (room bill billed-marker).

---

### 11.7 Test scenarios (room + bar rollup)

| # | Setup | Expected mess bill | Current engine behaviour |
|---|-------|-------------------|--------------------------|
| T-R01 | CHARGE_TO_HOST checkout May 15, check-in Apr 20 | `room_amount` = folio total in **May** cycle | May miss if `created_at` = Apr; or wrong month |
| T-R02 | DIRECT_SETTLEMENT, host assigned | `room_amount` = 0 | ✅ Excluded |
| T-R03 | Guest bar ₹500 on booking, folio synced | `room_amount` includes ₹500; `bar_amount` = 0 for host | Today: bar lost; after sync: double if no `booking_id` filter |
| T-R04 | Host personal bar ₹200 | `bar_amount` = 200 | ❌ Zero (`signed` filter + pending status) |
| T-R05 | Re-run billing same period | Same totals, no duplicate room lines | ❌ Duplicates room lines (no billed marker) |
| T-R06 | Draft folio, not checked out | Not on mess bill | ✅ Not finalized / wrong status |

**Existing test:** `lib/guest-rooms/guest-rooms.test.ts` — settlement routing simulation (T-R02). **Missing:** integration test against `runMonthlyBillingAction` query filters.

---

### 11.8 Recommended engine query (target state)

```typescript
// Bar — member bucket only
.from('bar_chits')
.select('id, profile_id, total_amount, date')
.eq('unit_id', unit_id)
.eq('status', 'finalized')
.not('profile_id', 'is', null)
.is('booking_id', null)
.gte('date', start_date)
.lte('date', end_date);

// Room — host transfer bucket
.from('room_bills')
.select(`id, total_amount, booking:bookings!inner (
  host_profile_id, guest_name, check_out_date,
  room:rooms (name)
)`)
.eq('unit_id', unit_id)
.eq('settlement_type', 'CHARGE_TO_HOST')
.eq('payment_status', 'transferred_to_mess_bill')  // → unified status after P1-MIG-01
.gte('booking.check_out_date', start_date)
.lte('booking.check_out_date', end_date);
// Post-run: UPDATE room_bills SET billing_period_id = :id WHERE id IN (...)
```

---

## 12. Document history

| Date | Change |
|------|--------|
| 2026-09-09 | Initial audit: compute algorithms, test matrix, REQ-BIL-10, P4-G gap register |
| 2026-09-09 | Deep audit §3.2–3.6: bar/subscription/misc field matrices, Phase 1 dependency matrix (§3A), `is_billed` register (§3B), P4-G-019–022 |
| 2026-09-09 | §11 Phase 1 guest rooms rollup audit: filters, field deps, bar folio double-count, P4↔P1 gap overlap |
