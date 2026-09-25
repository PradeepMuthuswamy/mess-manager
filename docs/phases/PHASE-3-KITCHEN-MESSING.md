# Phase 3 — Kitchen & Messing: Field Spec & Gap Register

> **Audit date:** 2026-09-09  
> **Foundation:** [`FOUNDATION.md`](../FOUNDATION.md) · **Master data:** tariff domain — not catalog-backed  
> **Requirements:** [`requirements.md`](../requirements.md) §6 (REQ-MES-*), §3.3 (register approval), REQ-GOV-21  
> **Schema:** MongoDB collections (`attendance_days`, `kitchen_expenditures`, `meal_cut_requests`, `unit_mess_tariffs`)

---

## 0. Executive summary

| Area | Ready | Gaps |
|------|-------|------|
| **`/messing` page (read path)** | ~75% | Real MongoDB queries; no date picker UI; no billing-cycle progress (REQ-MES-30) |
| **Kitchen expenditure dialog** | ~70% | Wired to action; missing `receipt_ref`, `sourcing_category` UI; hardcoded `LOCAL_PURCHASE` |
| **Meal cut toggle** | ~60% | Self-service wired; auto-`approved` (no request queue); no custom reason field |
| **Casual guest dialog** | ~65% | Wired to action; **auth mismatch** (`attendance.write` required, button shown to all readers) |
| **Flat rates** | ~90% | Lives in `/settings` (not `/messing`); all 8 meal types |
| **P-rate engine** | ~80% | Computed on kitchen save + stored; no post-attendance-finalize hook (P3-P-03) |
| **Register approval** | 0% | No status column, no Food Member queue, no dashboard widget (P3-APP-*) |
| **Food Member dashboard** | 0% | REQ-GOV-21 / P3-APP-02 not built |
| **REST API** | 0% | No `/api/v1/messing/*` |
| **Tests** | ~15% | Billing compute tests only; no action/query integration tests |

**Verdict:** `/messing` is **no longer a placeholder stub** — it reads and writes real tables via server actions. Phase 3 is **partially shipped** (~55% of definition-of-done). Mock data remains on **`/dashboard`**, not on `/messing`.

---

## 1. Is `/messing` still mock?

| Surface | Mock? | Evidence |
|---------|-------|----------|
| `/messing` page data | **No** | `getDinerTodayStatus`, `getDailyExpenditure`, `getMemberMealCuts`, `listGuestMeals`, `getAttendanceDay` |
| `/messing` mutations | **No** | `recordDailyKitchenExpenditureAction`, `recordMealCutAction`, `cancelMealCutAction`, `recordGuestMealAction` |
| `/dashboard` meals widget | **Yes** | Hardcoded `todayMeals` array with fake menus/status |
| Register approval workflow | **Not built** | No `draft` → `submitted` → `approved` state machine |
| Billing cycle progress (REQ-MES-30) | **Not built** | No link to `mess_billing_periods` or cycle MTD estimate |
| P-rate dashboard trend (P3-P-04) | **Not built** | Only inline on `/messing` sidebar |
| Food Member approval queue (P3-APP-02) | **Missing** | No UI anywhere |

---

## 2. Page: `/messing` (`page.tsx`)

**Auth:** `requireCapability('attendance.read')`  
**Date:** `searchParams.date` (YYYY-MM-DD regex); defaults to today — **no date-picker UI exposed**

### 2.1 Read-only display fields

| UI label | Source | Schema / table | Wired |
|----------|--------|------------------|-------|
| Billing mode badge | `dinerToday.billingMode` | `units.messing_billing_mode` | Real |
| Day roll status | `dinerToday.isAttendingDay` | `attendance_days` + `attendance_absences` | Real |
| Meal rows (breakfast/lunch/dinner) | `dinerToday.meals[]` | `mess_meal_cuts`, `messing_flat_rates` | Real |
| Per-meal flat rate | `meal.rate` | `messing_flat_rates` | Real (FLAT_RATE only shown) |
| Cut reason | `meal.cutReason` | `mess_meal_cuts.reason` | Real |
| Estimated today charge | `dinerToday.estimatedDailyCharge` | Computed in `getDinerTodayStatus` | Real |
| Today's P-rate | `dinerToday.todayPRate` | `mess_daily_p_rates.rate_per_diner` | Real |
| Diners on roll | `presentCount` | `attendance` via `getAttendanceDay` | Real |
| Recent meal cuts list | `recentCuts[]` | `mess_meal_cuts` | Real |
| Casual guest sidebar | `guestMeals[]` | `guest_meals` | Real |

### 2.2 Hidden / server-only props (not form fields)

| Prop | Passed to | Schema |
|------|-----------|--------|
| `unitId` | All child components | `units.id` |
| `date` | Dialogs, toggles | — |
| `presentCount` | Kitchen dialog | attendance present count |
| `initialMorning/Afternoon/Dinner` | Kitchen dialog | `mess_daily_expenditures.*_amount` |
| `initialVendor`, `initialNotes` | Kitchen dialog | `mess_daily_expenditures.vendor_name`, `.notes` |
| `hostProfileId` | Casual guest dialog | `guest_meals.host_profile_id` |

### 2.3 Capability gates

| Control | Visibility | Capability |
|---------|------------|------------|
| Mess Havildar Log | `canWriteAttendance` | `attendance.write` |
| Host Casual Guest | **Always shown** | Action requires `attendance.write` (**bug**) |
| Meal cut toggle | Always shown | Self: `requireUser()`; other profile: `attendance.write` |

---

## 3. Form: Kitchen Expenditure Dialog

**File:** `app/(app)/messing/_components/kitchen-expenditure-dialog.tsx`  
**Action:** `recordDailyKitchenExpenditureAction` → `dailyKitchenExpenditureSchema`  
**Task IDs:** P3-KIT-01, P3-KIT-02, P3-KIT-03

| Field (UI label) | HTML name / state | Type | Required | Client validation | Server validation (Zod) | DB column | Wired |
|------------------|-------------------|------|----------|-------------------|-------------------------|-----------|-------|
| Breakfast (₹) | `morning` | number | No (defaults 0) | `min=0`, `step=0.01` | `z.coerce.number().min(0).default(0)` | `mess_daily_expenditures.morning_amount` | **Action** |
| Lunch (₹) | `afternoon` | number | No | same | same | `.afternoon_amount` | **Action** |
| Dinner (₹) | `dinner` | number | No | same | same | `.dinner_amount` | **Action** |
| Vendor / Market Shop Name | `vendor` | text | No | — | `z.string().trim().optional().nullable()` | `.vendor_name` | **Action** |
| Remarks / Voucher No. | `notes` | textarea | No | — | `z.string().trim().optional().nullable()` | `.notes` | **Action** |
| *(hidden)* unit | prop `unitId` | uuid | Yes | — | `unit_id: z.string().uuid()` | `.unit_id` | **Action** |
| *(hidden)* date | prop `date` | date string | Yes | — | `expenditure_date: YYYY-MM-DD regex` | `.expenditure_date` | **Action** |
| *(hardcoded)* sourcing | — | enum | — | — | `'LOCAL_PURCHASE'` default | `.sourcing_category` | **Action** (fixed value) |

**Not in UI (schema supports):**

| Field | Zod | DB | Gap |
|-------|-----|-----|-----|
| Receipt ref | `receipt_ref` optional | `mess_daily_expenditures.receipt_ref` | P3-KIT-01 |
| Sourcing category | `LOCAL_PURCHASE \| CANTEEN \| OTHER` | `.sourcing_category` | P3-KIT-01 |

**Side effects on save:** upsert `mess_daily_expenditures`, compute `total_amount`, upsert `mess_daily_p_rates` (P3-P-01, P3-P-02).

---

## 4. Form: Meal Cut Toggle

**File:** `app/(app)/messing/_components/meal-cut-toggle.tsx`  
**Actions:** `recordMealCutAction`, `cancelMealCutAction` → `mealCutInputSchema`  
**Task IDs:** P3-FLAT-01, P3-FLAT-02

| Field | Type | Required | Validation | DB column | Wired |
|-------|------|----------|------------|-----------|-------|
| *(button only)* Place Meal Cut | — | — | — | — | **Action** |
| *(button only)* Restore Meal | — | — | — | DELETE row | **Action** |
| `unit_id` | uuid (prop) | Yes | uuid | `mess_meal_cuts.unit_id` | **Action** |
| `cut_date` | date (prop) | Yes | YYYY-MM-DD | `.cut_date` | **Action** |
| `meal_type` | enum (prop) | Yes | `messingMealTypeSchema` | `.meal_type` | **Action** |
| `reason` | string | No | max 300 | `.reason` | **Hardcoded** `'Officer self-service cut'` |
| `profile_id` | uuid | No | optional | `.profile_id` | Defaults to current user |
| `status` | — | — | — | `.status` | **Hardcoded** `'approved'` in action (skips `requested` workflow) |

**Gaps vs P3-FLAT-01 / REQ-MES-03:**

- No `/messing/cuts` approval page for Mess Havildar
- No `requested` → `approved` / `rejected` flow
- No reason input in UI
- Tea / packed meal types not shown (only breakfast, lunch, dinner in page)

---

## 5. Form: Casual Guest Dialog

**File:** `app/(app)/messing/_components/casual-guest-dialog.tsx`  
**Action:** `recordGuestMealAction` → `guestMealInputSchema`  
**Task IDs:** P3-G-01 (record), P3-G-02 (list on page)

| Field (UI label) | State | Type | Required | Client validation | Server validation | DB column | Wired |
|------------------|-------|------|----------|-------------------|-------------------|-----------|-------|
| Meal Session | `mealType` | select | Yes | 3 options only | full `messingMealTypeSchema` | `guest_meals.meal_type` | **Action** |
| Number of Guests | `guestCount` | number | Yes | `min=1`, `max=50` | `int().min(1).default(1)` | `.guest_count` | **Action** |
| Guest Name(s) / Relation | `guestNames` | text | No | — | trim optional | `.guest_names` | **Action** |
| Tariff per Guest (₹) | `rate` | number | Yes | `min=0`, `step=1` | `z.coerce.number().min(0)` | `.rate_charged` | **Action** |
| *(hidden)* unit | prop | uuid | Yes | — | uuid | `.unit_id` | **Action** |
| *(hidden)* host | prop | uuid | Yes | — | uuid | `.host_profile_id` | **Action** |
| *(hidden)* date | prop | date | Yes | — | YYYY-MM-DD | `.meal_date` | **Action** |
| *(computed)* total | display | — | — | `guestCount * rate` | action computes | `.total_amount` | **Action** |
| Notes | — | — | — | — | optional in schema | `.notes` | **Not in UI** |

**Auth gap:** Dialog visible to all `attendance.read` users; action calls `requireCapability('attendance.write')` — members without write cap get error on submit.

**Default rate:** UI default `₹250` (`defaultGuestRate` prop); not loaded from unit master.

---

## 6. Flat rates (Settings, not `/messing`)

**File:** `app/(app)/settings/_components/unit-settings-card.tsx`  
**Action:** `updateUnitFlatRatesAction`  
**Task ID:** P3-FLAT-02 (partial)

| Field | Type | Required | Validation | DB | Wired |
|-------|------|----------|------------|-----|-------|
| Effective Date | date | Yes | HTML required | `messing_flat_rates.valid_from` | **Action** |
| Rate per meal type (×8) | number | Yes | min 0 | `.rate`, `.meal_type` | **Action** |
| Billing mode | select | Yes | enum | `units.messing_billing_mode` | **Action** (unit settings) |

---

## 7. Schema ↔ UI mapping (all Phase 3 tables)

### 7.1 `mess_daily_expenditures`

| Column | In kitchen dialog? | Notes |
|--------|-------------------|-------|
| `id` | — | auto |
| `unit_id` | hidden prop | |
| `expenditure_date` | hidden prop | |
| `morning_amount` | Breakfast (₹) | |
| `afternoon_amount` | Lunch (₹) | |
| `dinner_amount` | Dinner (₹) | |
| `total_amount` | computed in action | |
| `notes` | Remarks | |
| `receipt_ref` | **Missing** | P3-KIT-01 |
| `vendor_name` | Vendor | |
| `sourcing_category` | **Hardcoded** | P3-KIT-01 |
| `created_by` / `updated_by` | — | set in action |

### 7.2 `mess_daily_p_rates`

| Column | UI exposure | Notes |
|--------|-------------|-------|
| `rate_per_diner` | Sidebar “Today's P_d” | P3-P-02 |
| `total_expenditure` | — | action only |
| `present_count` | “Diners on Roll” (from attendance, not p_rates row) | |
| `calculated_at` / `calculated_by` | — | action only |

### 7.3 `mess_meal_cuts`

| Column | UI exposure | Notes |
|--------|-------------|-------|
| `meal_type` | Meal row + recent cuts | breakfast/lunch/dinner only |
| `cut_date` | prop / list | |
| `status` | Badge in recent cuts | always `approved` on self-cut |
| `reason` | Display + hardcoded on create | no edit UI |
| `profile_id` | implicit (current user) | |

### 7.4 `guest_meals`

| Column | Casual guest dialog? | Sidebar list? |
|--------|---------------------|---------------|
| `meal_type` | Select | Yes |
| `guest_count` | Input | Yes |
| `guest_names` | Input | Yes |
| `rate_charged` | Input | — |
| `total_amount` | computed display | Yes |
| `meal_date` | hidden | Yes |
| `host_profile_id` | hidden | filtered to current user |
| `notes` | **Missing** | — |

---

## 8. REQ-MES-30 — Member view gaps

**Requirement:** Officers view personal messing: **meal cuts**, **estimated dues**, **billing cycle progress** (replace mock `/messing` page).

| REQ-MES-30 element | Status on `/messing` | Gap |
|--------------------|----------------------|-----|
| Meal cuts (today) | ✅ Toggle + display | — |
| Meal cuts (history) | ✅ Recent cuts card (±30 days) | No pagination; status always shown but workflow N/A |
| Estimated dues (today) | ✅ `estimatedDailyCharge` | P-register: 0 until kitchen log; flat: sum of non-cut rates |
| Estimated dues (cycle MTD) | ❌ | No sum across billing period; no link to `calculateMemberMessingCycle` |
| Billing cycle progress | ❌ | No `mess_billing_periods` widget (days elapsed, projected total, period name) |
| Published bill preview | ❌ | Lives on `/billing` (separate module) |

**Related:** `/dashboard` still shows **mock** `todayMeals` — officers may see conflicting data vs `/messing`.

---

## 9. Food Member & register approval gaps

| Requirement / Task | Status |
|--------------------|--------|
| REQ-MES-20 — Havildar enters register | **Partial** — kitchen spend only; attendance entered on `/attendance` |
| REQ-MES-21 — Food Member approves before billing | **Not built** |
| REQ-MES-22 — Status on Food Member / Secretary dashboards | **Not built** |
| REQ-GOV-21 — Food Member dashboard register status | **Not built** |
| P3-APP-01 — `draft` → `submitted` → `approved` | **No schema column** for register status |
| P3-APP-02 — Food Member approval queue on dashboard | **Missing** |
| P3-APP-03 — Block P-rate in billing until approved | **Not built** (Phase 4 dependency) |
| P3-P-04 — P-rate 7-day trend widget | **Missing** |

**Suggested schema (not on disk):** `mess_daily_register_status` or columns on `mess_daily_expenditures`: `status`, `submitted_at`, `approved_at`, `approved_by`.

---

## 10. Phase task checklist (plan IDs)

| ID | Description | Status |
|----|-------------|--------|
| **P3-KIT-01** | Kitchen form: date, amounts, vendor, receipt, sourcing | **Partial** — dialog on `/messing`; missing receipt + sourcing UI |
| **P3-KIT-02** | CRUD `mess_daily_expenditures` | **Done** — upsert in action |
| **P3-KIT-03** | Save triggers P-rate snapshot | **Done** |
| **P3-P-01** | `computeDailyPRateAction` | **Inline** in kitchen action (no standalone export) |
| **P3-P-02** | Upsert `mess_daily_p_rates` | **Done** |
| **P3-P-03** | Hook after attendance finalize | **Not built** |
| **P3-P-04** | Dashboard P-rate widget | **Not built** |
| **P3-FLAT-01** | `/messing/cuts` request/approve | **Not built** — self-cut only, auto-approved |
| **P3-FLAT-02** | Member view cuts + flat dues | **Partial** — today + recent; no cycle MTD |
| **P3-FLAT-03** | Option B (day roll − cuts) | **Implemented** in `getDinerTodayStatus` |
| **P3-G-01** | Casual guest record form | **Done** (auth gap) |
| **P3-G-02** | Guest meals list on `/messing` | **Done** (host-scoped, last 5) |
| **P3-APP-01** | Register status workflow | **Not built** |
| **P3-APP-02** | Food Member approval queue | **Missing** |
| **P3-APP-03** | Gate billing on approval | **Not built** |
| **P3-TST-01** | 5-day dry-run | **Not run** |

---

## 11. Phase 3 definition of done (from plan)

| Criterion | Met? |
|-----------|------|
| Havildar enters kitchen spend for test week | ⚠️ UI exists; migration may be unapplied |
| P-rates match manual calculation | ⚠️ Logic in action; needs live verification |
| Food Member approves register from dashboard | ❌ |
| Flat-rate path: cuts + rates → estimate | ✅ Today only |
| Mock data removed from `/messing` | ✅ |
| Mock removed from `/dashboard` | ❌ |

---

## 12. Recommended next work (priority)

1. **Apply migration** `20260614000000` to remote/staging; run `npm run db:types`
2. **Fix guest meal auth** — use `requireUser()` for self-host OR gate button on capability
3. **P3-APP-01/02** — register status + Food Member dashboard queue (REQ-MES-21, REQ-GOV-21)
4. **REQ-MES-30** — billing cycle MTD widget on `/messing` (reuse `lib/billing/compute.ts`)
5. **P3-KIT-01** — add receipt ref + sourcing category to kitchen dialog
6. **P3-P-03** — recalculate P-rate when attendance finalized
7. **Replace mock meals** on `/dashboard` with `getDinerTodayStatus` or link-only card
8. **REST API** — `/api/v1/messing/*` per project conventions

---

## 13. File index

| Path | Role |
|------|------|
| `app/(app)/messing/page.tsx` | Server page; data aggregation |
| `app/(app)/messing/_components/kitchen-expenditure-dialog.tsx` | Havildar kitchen log form |
| `app/(app)/messing/_components/meal-cut-toggle.tsx` | Self-service cut/restore |
| `app/(app)/messing/_components/casual-guest-dialog.tsx` | Guest meal form |
| `lib/messing/actions.ts` | All mutations |
| `lib/messing/queries.ts` | Read models |
| `lib/messing/types.ts` | Shared row/view types |
| `lib/schemas/messing.ts` | Zod schemas (shared with API TBD) |
| `app/(app)/settings/_components/unit-settings-card.tsx` | Flat rates + billing mode |

---

## 14. Cross-phase overlaps (Phases 1, 2, 4)

> Full matrix: [`FOUNDATION.md`](../FOUNDATION.md) §3, §5

| Connection | Phases | Status | Blocker |
|------------|--------|--------|---------|
| `present_count` shared | 2, 3, 4 | ⚠️ | Draft attendance used; finalize hooks missing |
| `guest_meals` vs room food | 1, 3, 4 | ⚠️ | Double-charge risk; no `booking_id` FK |
| `20260614000000` migration | 3, 4 | ❌ likely pending | Joint blocker |
| Register approval → billing | 3, 4 | ❌ | P3-APP-03 / P4-G-007 |
| `finalizeAttendance` hooks | 2, 3 | ❌ | Ration auto-post + P-rate recalc |

**Critical path:** Phase 3 P-rates + guest meals → Phase 4 engine. Phase 2 parallelizable.

---

## 15. Security audit (SEC-P3)

| ID | Severity | Issue |
|----|----------|-------|
| SEC-P3-01 | High | Kitchen SELECT = any unit member, not `attendance.read` |
| SEC-P3-04/05 | High | Casual guest self-service blocked (action + RLS) |
| SEC-P3-02/03 | Med | All meal cuts / guest meals visible to unit members |

---

## 16. Guest meals deep audit (P3-G-01–15)

| Field | SQL | UI | Billing |
|-------|-----|-----|---------|
| `host_profile_id` | FK profiles | hidden | mess bill bucket key |
| `meal_date` | date | hidden | period filter |
| `rate_charged` × `guest_count` | decimal | inputs | line item |
| `is_billed` | **missing** | — | re-run double-count (P3-G-06) |
| `booking_id` | **missing** | — | room overlap guard (P3-G-07) |

**Auth fix:** Match `mess_meal_cuts` — self-host via `requireUser()` + RLS `host_profile_id = auth.uid()`.

---

## 17. P-register engine (P3-G-001–023 summary)

| REQ | Status | Top gap |
|-----|--------|---------|
| REQ-MES-10 Kitchen entry | ~70% | Missing receipt/sourcing UI |
| REQ-MES-11 Finalized attendance | ~30% | Draft count used |
| REQ-MES-12 P-rate stored | ~75% | Stale after attendance change |
| REQ-MES-13 Cycle sum | ~65% | Meal cuts ignored in P-register billing |

**Formula:** `P_d = (morning + afternoon + dinner) / present_count` — in `calculateDailyPRate()` but duplicated inline in kitchen action.

---

## 18. Agent audit index (10 agents)

| Focus | Key finding |
|-------|-------------|
| Schema | No register approval table |
| Actions | 5 actions; no `computeDailyPRateAction` export |
| Queries | `getMonthlyPRates` unused |
| UI | `/messing` real; dashboard mock |
| Flat rates | Tea/packed stored, not billed |
| P-register | No finalize hook |
| Register approval | 0% |
| Guest meals | Self-service blocked |
| Security | RLS weaker than attendance |
| Cross-phase | Migration 140 shared with P4 |
