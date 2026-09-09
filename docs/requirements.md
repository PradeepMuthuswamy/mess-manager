# Officers' Mess — Product Requirements

> **Status:** Living document (September 2026)  
> **Related:** [`FOUNDATION.md`](./FOUNDATION.md) (architecture, master-data redesign, phase plan), [`SHARED-DATA-MODEL.md`](./SHARED-DATA-MODEL.md) (schema contract)

This document is the **canonical requirements specification** for the Officers' Mess SaaS platform. It consolidates billing, operations, governance, and organizational rules described by stakeholders.

---

## 1. Scope & goals

### 1.1 Product vision

Deliver a **multi-tenant SaaS** so an Indian Officers' Mess (or related establishment) can be onboarded quickly and run day-to-day operations — messing, bar, guest rooms, ration, parties, and monthly billing — without bespoke software.

### 1.2 Primary goals

| ID | Goal |
|----|------|
| G-01 | Onboard a new unit in minutes with sensible defaults |
| G-02 | Support different mess profiles (full mess, transit mess, guest-rooms-only, ration-focused) |
| G-03 | Model real mess **governance** (appointments, committee members, NCOs) with correct visibility |
| G-04 | Produce accurate **monthly mess bills** (26th–25th cycle) from operational data |
| G-05 | Allow **guest room** stays to end with guest payment or charge to sponsoring officer |
| G-06 | Track **government ration** scales, daily consumption, and monthly net reports |
| G-07 | Every user sees a **role-appropriate dashboard** on sign-in |
| G-08 | **Mess committee** decisions (menu, rates, minutes) are recorded and drive operational config |
| G-09 | **Social calendar** events trigger timely email reminders to members |
| G-10 | Published **mess bills** are emailed to every member each billing cycle |

### 1.3 Out of scope (initial releases)

- Public guest self-booking portal (Phase 5 candidate)
- Integrated payment gateway (record-only in early phases)
- Payroll / HR outside mess operations
- Cross-mess officer identity federation

---

## 2. Platform & tenancy

### 2.1 Tenant model

- **REQ-PLAT-01:** Each subscribing customer is a **unit** (one mess), isolated by `unit_id` with row-level security.
- **REQ-PLAT-02:** A platform **super admin** manages all units, global masters, and master ration scales (Admin app).
- **REQ-PLAT-03:** Each unit has a **unit admin** surface (Mess Secretary / PMC) for users, settings, and bill publication within that unit.
- **REQ-PLAT-04:** Units declare **enabled modules** (e.g. `guest_rooms`, `ration`, `bar`, `attendance`, `billing`, `parties`, `garden`) so transit or guest-rooms-only tenants are not forced through irrelevant navigation.
- **REQ-PLAT-05:** Unit configuration includes: name, code, mess type, terrain, messing billing mode (flat rate vs P-register), timezone, billing cycle anchor (default 26th–25th).
- **REQ-PLAT-06:** Each unit selects its own **bill / statement format** (layout template, letterhead fields, line-item grouping) for mess bills, room bills, and ration reports — independent of billing mode.

### 2.2 Onboarding

- **REQ-PLAT-10:** Provisioning workflow: create unit → clone master ration scale (if enabled) → seed default appointments → invite first unit admin → unit is operational.
- **REQ-PLAT-11:** Default capability templates and **default appointment list** are seeded per new unit (see §3).
- **REQ-PLAT-12:** First user invite must not fail due to missing `unit_id` on profile creation.

### 2.3 Automation

- **REQ-PLAT-20:** Configurable **scheduled jobs** per unit (cron): daily ration auto-post when attendance is finalized; daily P-rate snapshot after kitchen expenditure entry; billing period open on cycle start date; **daily social-calendar reminder emails** (see §19).
- **REQ-PLAT-21:** Jobs must be idempotent and auditable (who/what/when).

### 2.4 Unit configuration & document formats

Settings already support **messing billing mode** (`FLAT_RATE` vs `P_REGISTER_SPLIT`). Extend unit config with:

| Setting | Purpose | Status today |
|---------|---------|--------------|
| Messing billing mode | Flat rate vs P-register | ✅ Settings UI |
| Mess type / terrain | Ration scale resolution | ✅ Settings UI |
| **Bill format template** | PDF/print layout for mess bills | ❌ Not built |
| **Room bill format template** | Guest checkout statement layout | ❌ Not built |
| **Ration report format** | Monthly net / ASC returns layout | ❌ Not built |
| **Email templates** | Monthly bill, reminders, menu publish | ❌ Not built (Resend infra exists) |
| Notification preferences | Which emails a unit sends | ❌ Not built |

**REQ-CFG-01:** Unit admin selects a **bill format template** from a platform library or uploads unit-specific layout (fields: header, unit crest, line groupings, footer, signatory blocks for PMC/Secretary).

**REQ-CFG-02:** Changing flat rates, guest tariffs, or subscription amounts should record **committee meeting reference** when applicable (link to §3.4).

**REQ-CFG-03:** Bill format choice does not alter calculation logic — presentation only.

**REQ-CFG-04:** Preview bill PDF in Settings before publishing cycle.

### 2.5 Master data & global catalog (single source of truth)

Operational modules (bar, ration, inventory) reference **one canonical item identity** per product — e.g. "Old Monk" nationwide — even when **SKU**, **lot cost**, and **menu price** differ by unit and time. **Catalog-backed consumption** must use **`product_variants.id`**; **tariff charges** (room rent, flat messing, subscriptions) use **unit config**, not catalog rows.

**Architecture:** [`FOUNDATION.md`](./FOUNDATION.md) §2 (target model, foundation reset, phase audit).

#### 2.5.1 Design principles

| Principle | Requirement |
|-----------|-------------|
| **Three planes** | **Identity** (category → product → variant) · **Lot economics** (`unit_inventory`) · **Sale price** (menu rate + snapshot on chit lines). |
| **Global catalog only** | `products` are **platform-global**. Units **adopt** via `unit_catalog`; ops app does not create products. |
| **Two domains** | **Catalog** (bar, ration, stock) requires `variant_id`. **Tariff** (rooms, messing, subs) uses unit config tables. |
| **Variant is the join key** | Bar, ration scale, ration ledger, inventory lots share `product_variants.id`. |
| **FIFO / open bottle** | Lots deplete in `acquired_on` order; fractional `qty_packs` = open bottle. |
| **Historical truth** | Posted chits store rate at sale time; menu rate changes do not rewrite history. |
| **Analytics-ready** | Facts carry `variant_id` + `profile_id` + date + quantity for cross-mess rollups (Phase 7+). |

#### 2.5.2 Functional requirements

| ID | Requirement |
|----|-------------|
| **REQ-MD-01** | **Admin app:** CRUD global `categories`, `products`, `product_variants`. **Ops app:** search catalog + manage `unit_catalog` adoption only. |
| **REQ-MD-02** | **Unique canonical name** per product within category — `name_normalized` (lower + trim), case-insensitive. |
| **REQ-MD-03** | **`unit_catalog`:** `(unit_id, variant_id, is_enabled, local_sku)`. Adoption is the only way a unit enables an item. |
| **REQ-MD-04** | **Bulk import:** match or adopt global variant by name/SKU → write **rate** to inventory lot (bar/grocery) or ration scale (ration). |
| **REQ-MD-05** | **`unit_inventory` lots:** `variant_id`, fractional `qty_packs`, lot `rate`, `acquired_on`, typed source. |
| **REQ-MD-06** | **FIFO depletion** on bar sale; peg-to-bottle conversion for spirits. |
| **REQ-MD-07** | **`bar_chit_items`:** `variant_id` + snapshot rate/amount; no free-text product names on posted chits. |
| **REQ-MD-08** | Ration authorisations: SCD-2 on `ration_scale_item_versions` keyed by `variant_id`. |
| **REQ-MD-09** | **`unit_menu_rates`:** optional committee peg/bottle rate per variant (`effective_from`); distinct from lot cost. |
| **REQ-MD-10** | Cross-unit analytics (Phase 7+): aggregate by `variant_id` / `product_id`, rank, unit, period. |
| **REQ-MD-11** | Platform catalog cache (Phase 5+): optional; Postgres remains source of truth for transactions. |
| **REQ-MD-12** | Catalog changes audited; capabilities: `masters.read`, `masters.write`, `masters.write.global`. |
| **REQ-MD-13** | **Foundation reset:** migration adds target tables; operational purge allowed; re-seed global catalog before go-live. |

#### 2.5.3 Relationship to inventory (§9)

REQ-INV-01 is the lot layer under REQ-MD-05. REQ-INV-05 unchanged — ration ledger separate from bar FIFO, same `variant_id` where shared.

#### 2.5.4 Implementation status (audit 2026-09-10 — Phase 0 schema applied)

| REQ | Today | After Phase 0 |
|-----|-------|---------------|
| REQ-MD-01 | Schema: products global-only. Ops adopt via `unit_catalog` (UI still partial) | Admin CRUD + ops adopt only |
| REQ-MD-02 | ✅ `name_normalized` unique on `(category_id, name_normalized)` | — |
| REQ-MD-03 | ✅ `unit_catalog` live | — |
| REQ-MD-04 | ❌ Import drops rate | Adopt + lot/scale |
| REQ-MD-05–08 | ✅ Mostly built | Keep FIFO + ration SCD-2 |
| REQ-MD-09 | ✅ `unit_menu_rates` live | — |
| REQ-MD-10–11 | Deferred | — |
| REQ-MD-12 | ✅ | — |
| REQ-MD-13 | ✅ Foundation migration applied (`20260909183414`); purge in that migration | Re-seed global catalog before go-live |

---

## 3. Organization, appointments & governance

Indian Officers' Messes are run by a **committee** with named **appointments**. A single person may hold **multiple appointments** at the same time (e.g. Wine Member + Bar NCO). Appointments determine **what they see and what they can do**, not just their login role.

### 3.1 Appointment hierarchy (honorary → executive → committee → NCO)

| Order | Appointment | Description | Typical visibility |
|-------|-------------|-------------|-------------------|
| 1 | **President (Commanding Officer)** | Honorary **chairman** of the mess; not day-to-day operator | **Read-only visibility across entire unit** — dashboards, reports, bills, audit summaries; no routine data entry expected |
| 2 | **PMC** (President, Mess Committee) | Second-in-command; executive oversight | Full operational + admin visibility; approves major decisions; can publish bills |
| 3 | **Mess Secretary** | Day-to-day administrative head | Full ops + user management + billing draft/finalize + reports |
| 4 | **Committee members** | Functional portfolio holders (see §3.2) | Domain-specific read/write per portfolio |
| 5 | **NCO / staff** | Mess Havildar, Bar NCO, Wine NCO, Property NCO, etc. | Execute daily transactions under committee oversight |

**REQ-GOV-01:** President (CO) appointment grants **unit-wide read** across all enabled modules without implying write access unless explicitly granted.

**REQ-GOV-02:** PMC and Mess Secretary are distinct appointments; both may hold admin-grade capabilities; PMC is senior to Mess Secretary in approval workflows where defined.

**REQ-GOV-03:** Appointments are **unit-scoped** and **time-bound** (optional `valid_from` / `valid_to` for handover).

**REQ-GOV-04:** One profile may hold **multiple concurrent appointments**; effective permissions are the **union** of all active appointment capability sets.

**REQ-GOV-05:** Default appointment catalog is **seeded** for every new unit; unit admin assigns people to appointments.

### 3.2 Default committee appointments (seed catalog)

| Appointment key | Display name | Primary responsibilities | Required capabilities (indicative) |
|-----------------|--------------|--------------------------|-----------------------------------|
| `president` | President (CO) | Honorary chairman; oversight | All `*.read`, `reports.unit`, audit summaries |
| `pmc` | PMC | Executive committee head | Admin-grade set (see Mess Secretary) + bill finalize |
| `mess_secretary` | Mess Secretary | Admin + operations | Full unit ops + `users.*` + `billing.draft/finalize` |
| `food_member` | Food Member | Approve purchases; **audit daily messing register**; oversee kitchen/ration alignment | `attendance.read`, `ration.read`, purchase approval (TBD cap), `reports.unit`, audit views on kitchen expenditure |
| `wine_member` | Wine Member | Oversee wine/bar procurement policy; audit bar accounts | `bar.read`, `bar.finalize`, `inventory.read`, bar audit reports |
| `garden_member` | Garden Member | Garden / property upkeep budget & vendors | Garden module (TBD), `inventory.read`, misc procurement approval (TBD) |
| `property_member` | Property Member | Guest rooms, furniture, facilities | `rooms.*`, property reports |
| `sports_member` | Sports Member | Sports fund / subscriptions (optional) | Subscription config, `reports.unit` |
| `library_member` | Library Member | Library fund (optional) | Subscription config |
| `mess_havildar` | Mess Havildar | **Enter daily messing register** (attendance, kitchen expenditure, ration issue); daily ops | `attendance.write/finalize`, kitchen expenditure entry, `ration.issue`, `billing.draft` |
| `bar_nco` | Bar NCO / Bar Manager | Run bar; log chits; manage bar stock | `bar.write`, `inventory.write` (bar categories) |
| `wine_nco` | Wine NCO | Wine stock, procurement execution under Wine Member | `bar.write`, `inventory.write`; reports to Wine Member |
| `property_nco` | Property NCO / Guest Room Clerk | Bookings, check-in/out, room bills | `rooms.booking.write`, `rooms.read` |

**REQ-GOV-10:** Seed migration inserts appointment **definitions** (key, label, description, default capabilities); assignments link `profile_id` ↔ appointment.

**REQ-GOV-11:** UI for unit admin: assign/remove appointments; show active appointments on user profile.

**REQ-GOV-12:** Removing an appointment revokes its capabilities unless granted elsewhere.

### 3.3 Approval & audit workflows

| Workflow | Entered by | Reviewed / approved by |
|----------|------------|------------------------|
| Daily messing register (attendance + kitchen spend) | Mess Havildar | **Food Member** audits / approves |
| Purchase requisitions (kitchen, bar, garden) | NCO / Havildar | **Food Member** or **Wine Member** or **Garden Member** by category |
| Daily ration consumption post | Mess Havildar (manual or auto) | Food Member visiblity; flag anomalies |
| Bar chit finalize (period) | Bar NCO | Wine Member |
| Monthly mess bill draft | Mess Havildar / Secretary | PMC or Mess Secretary publish |
| Guest room bill (officer-charged) | Property NCO | Sponsor notified; rolls to mess bill |

**REQ-GOV-20:** Approval states: `draft` → `submitted` → `approved` / `rejected` with actor and timestamp (audit_log).

**REQ-GOV-21:** Food Member dashboard prominently shows **daily messing register** status (entered? approved?) for current and recent dates.

### 3.4 Mess committee meetings & minutes

The **Mess Committee** meets periodically to decide policy, menus, rates, and major expenditure. **Meeting minutes** are official records and should be stored in the system.

| ID | Requirement |
|----|-------------|
| REQ-MCM-01 | Record committee meeting: date, attendees (appointments/profiles), chair (PMC or President), venue, status (draft / finalized) |
| REQ-MCM-02 | Attach **minutes** document (rich text and/or PDF upload) |
| REQ-MCM-03 | Log **resolutions** as structured items: e.g. approve bill of fare for date range, revise flat meal rates, approve mess party budget, approve guest tariff |
| REQ-MCM-04 | Resolutions may **drive config changes** — e.g. approved flat rates → new `messing_flat_rates` row with `valid_from` and meeting reference |
| REQ-MCM-05 | Minutes are **read-only** after finalize; amendments via new meeting entry |
| REQ-MCM-06 | President, PMC, Mess Secretary, and committee members can view minutes; Mess Secretary / PMC can create and finalize |
| REQ-MCM-07 | Minutes searchable by date and resolution type for audit |

**REQ-MCM-10:** Daily **bill of fare** (menu) approval must reference the committee meeting or resolution that authorized it (see §6.4).

### 3.5 Bill of fare (daily menu)

The **bill of fare** (daily menu) is decided by the mess committee (often proposed by Food Member / kitchen, approved in committee or by Food Member per unit standing orders).

| ID | Requirement |
|----|-------------|
| REQ-BOF-01 | Define bill of fare per **date** (and optionally per meal: breakfast, lunch, dinner) |
| REQ-BOF-02 | Workflow: `draft` → `submitted` → `approved` (by Food Member or committee resolution) |
| REQ-BOF-03 | Approved menu visible to all dining members (dashboard / messing page / optional email on publish) |
| REQ-BOF-04 | Link approval to **committee meeting minutes** when menu change follows a formal meeting |
| REQ-BOF-05 | Historical archive of menus for audit and repeat planning |
| REQ-BOF-06 | Optional: tie menu to ration draw hints (informational; does not replace ration scale math) |

---

## 4. Dashboard & visibility

### 4.1 Per-user dashboard

**REQ-DASH-01:** Every authenticated user lands on a **dashboard** tailored to their active appointments (not a single static page).

**REQ-DASH-02:** Dashboard widgets are composed from enabled modules + appointment capabilities.

| Appointment | Example dashboard widgets |
|-------------|---------------------------|
| President (CO) | Unit summary KPIs, monthly bill status, outstanding dues, guest room occupancy, ration stock alert, audit feed (read-only) |
| PMC / Mess Secretary | Above + billing period controls, user/appointment management shortcuts, approval queue |
| Food Member | Daily messing register approval queue, kitchen expenditure vs P-rate trend, ration consumption vs auth, purchase approvals |
| Wine Member | Bar sales summary, pending chit finalization, bar stock low alerts |
| Garden Member | Garden spend vs budget (TBD module) |
| Property Member / NCO | Today's arrivals/departures, vacant rooms, draft bills, remote check-in actions |
| Mess Havildar | Today's attendance status, kitchen expenditure entry, ration post reminder |
| Bar / Wine NCO | Open chits, stock levels |
| Ordinary member (user) | My messing, my bar spend, my guest room charges, my current mess bill |

**REQ-DASH-03:** Users with multiple appointments see a **unified dashboard** merging widgets from all appointments (deduplicated).

**REQ-DASH-04:** Mobile layout prioritizes action items (check-in, approve register, post ration) for NCO/clerk roles.

### 4.2 Navigation

**REQ-DASH-10:** Sidebar/nav entries are filtered by **enabled modules** ∩ **appointment capabilities**.

**REQ-DASH-11:** President (CO) sees all modules read-only; destructive actions hidden.

---

## 5. Guest room management

*(Release 1 priority)*

### 5.1 Actors

Property Member, Property NCO (Guest Room Clerk), sponsoring officer, guest, Bar NCO (for in-house consumption).

### 5.2 Functional requirements

| ID | Requirement |
|----|-------------|
| REQ-GR-01 | Manage room inventory (types, nightly rates, maintenance status, furniture) |
| REQ-GR-02 | Create/edit/cancel bookings with guest identity and contact details |
| REQ-GR-03 | Assign **sponsor** (officer profile) and **billing target**: `guest` (guest pays) or `officer` (charge sponsor's mess bill) |
| REQ-GR-04 | Check-in creates draft **room bill** (rent + configurable default food charge) |
| REQ-GR-05 | During stay: add food orders, adhoc items, misc charges |
| REQ-GR-06 | Bar chits for in-house guest **roll up** into room bill at checkout (or on bar finalize) |
| REQ-GR-07 | Check-out finalizes room bill total |
| REQ-GR-08 | Guest-pay path: record payment method, reference, timestamp; status → `paid` |
| REQ-GR-09 | Officer-charge path: skip guest payment; include in sponsor's next **mess bill** |
| REQ-GR-10 | REST API for remote management (property officer travelling) |
| REQ-GR-11 | Mobile-friendly today arrivals/departures/worklist |

### 5.3 Business rules

- **REQ-GR-20:** Overlapping bookings for same room rejected.
- **REQ-GR-21:** Cancel only before check-in unless admin override.
- **REQ-GR-22:** Room bill must itemize rent, food, bar, adhoc, misc for audit.

---

## 6. Daily messing & kitchen

### 6.1 Messing billing modes

Each unit selects one mode (configurable):

#### Flat rate

- **REQ-MES-01:** Configure fixed ₹ per meal type (breakfast, lunch, dinner, packed variants, tea).
- **REQ-MES-02:** Member charge = rate × meals taken (after approved **meal cuts**).
- **REQ-MES-03:** Requires per-meal registration or approved cuts — not only full-day absentee roll.

#### P-register (pre-register / split)

- **REQ-MES-10:** Mess Havildar enters **daily kitchen expenditure** split: morning + afternoon + dinner (+ metadata: vendor, receipt, sourcing category: canteen / local purchase / other).
- **REQ-MES-11:** **Present diner count** from finalized attendance (default-present roll; breakfast presence may imply full day — unit policy).
- **REQ-MES-12:** Daily **P-rate** = total expenditure ÷ present count; stored per day.
- **REQ-MES-13:** Member messing charge for cycle = sum of daily P-rates for days member was present.

### 6.2 Daily messing register

- **REQ-MES-20:** **Mess Havildar enters** the daily messing register (attendance state + kitchen expenditure + notes).
- **REQ-MES-21:** **Food Member audits/approves** the register before it drives billing (approval workflow §3.3).
- **REQ-MES-22:** Register status visible on Food Member and Secretary dashboards.

### 6.3 Member-facing messing

- **REQ-MES-30:** Officers view personal messing: meal cuts, estimated dues, billing cycle progress (replace mock `/messing` page).

---

## 7. Bar & wine

| ID | Requirement |
|----|-------------|
| REQ-BAR-01 | Bar NCO logs chits against members, walk-in guests, or in-house guest bookings |
| REQ-BAR-02 | Chits decrement bar inventory (FIFO lots) |
| REQ-BAR-03 | Wine NCO executes procurement/stock under **Wine Member** oversight |
| REQ-BAR-04 | Wine Member audits bar accounts; can finalize bar period summaries |
| REQ-BAR-05 | Member bar chits roll into **monthly mess bill** |
| REQ-BAR-06 | Guest bar chits roll into **room bill** or standalone guest payment as configured |

---

## 8. Ration management

| ID | Requirement |
|----|-------------|
| REQ-RAT-01 | Maintain **government ration scales** per rank class × terrain with SCD-2 revision history |
| REQ-RAT-02 | Platform **master scales**; clone to unit on onboarding |
| REQ-RAT-03 | Daily consumption = authorised qty × present diner count (from finalized attendance) |
| REQ-RAT-04 | **Auto-post** consumption via scheduled job when attendance finalized (configurable per unit) |
| REQ-RAT-05 | Manual post/rollback by Mess Havildar when automation disabled |
| REQ-RAT-06 | Stock ledger: receipts (canteen / local / govt issue), adjustments, returns; consumption decrements balance |
| REQ-RAT-07 | **Members not charged** for ration usage on mess bill (mess fund / govt entitlement) |
| REQ-RAT-08 | **Guests** may be charged predetermined guest meal tariffs (host or guest pays — policy per unit) |
| REQ-RAT-09 | **Monthly net report**: opening + receipts − consumption ± adjustments = closing; export to standard mess formats (templates TBD) |

---

## 9. Inventory & procurement

| ID | Requirement |
|----|-------------|
| REQ-INV-01 | Track stock lots for bar/grocery with typed **source**: canteen, local purchase, government ration (where applicable to purchased goods) |
| REQ-INV-02 | Food Member **approves purchases** above threshold (threshold configurable per unit) |
| REQ-INV-03 | Wine Member approves bar/wine procurement |
| REQ-INV-04 | Garden Member approves garden/property procurement |
| REQ-INV-05 | Ration items use separate ration ledger (not bar stock lots) per existing design |

---

## 10. Parties & events

Parties may be **mess-funded** or **individually hosted**.

### 10.1 Party types

| Type | Fund source | Billing impact |
|------|-------------|----------------|
| **Mess party** | Mess fund / committee budget | Cost borne by mess; may use ration without member-level charge; accounted in mess expenditure reports |
| **Individual party** | Hosting member (e.g. marriage anniversary) | Host member charged via mess bill or direct settlement; ration usage rules per policy |

### 10.2 Functional requirements

| ID | Requirement |
|----|-------------|
| REQ-PTY-01 | Create party event: date, venue, type (mess / individual), host member (if individual), expected headcount |
| REQ-PTY-02 | Mess party: approve budget; track ration draw, bar, catering costs against mess fund |
| REQ-PTY-03 | Individual party: attribute costs to **host profile**; optional guest list |
| REQ-PTY-04 | Ration for party: flag consumption as mess-funded vs host-charged vs guest-charged |
| REQ-PTY-05 | Finalize party account; mess party → expenditure report; individual → line item on host mess bill |
| REQ-PTY-06 | Party Coordinator appointment (optional) for logistics; PMC/Mess Secretary approve large events |

### 10.3 Social calendar

The **social calendar** covers mess social events, member **anniversaries** (marriage, commissioning, etc.), birthdays, formal nights, and individual hosted parties — distinct from but linked to operational **party** records (§10.2).

| ID | Requirement |
|----|-------------|
| REQ-SOC-01 | Unit maintains a **social calendar** view (month / list) |
| REQ-SOC-02 | Event types: `anniversary`, `birthday`, `mess_party`, `individual_party`, `formal_night`, `holiday`, `other` |
| REQ-SOC-03 | Each event: date (or date range), title, description, **member profile** (whose anniversary), optional link to `party` record |
| REQ-SOC-04 | **Manual entry** via UI by Mess Secretary or designated appointment |
| REQ-SOC-05 | **Bulk import** from Excel/CSV (columns: date, type, member service no or email, title, notes) with preview and validation |
| REQ-SOC-06 | Import template downloadable from UI |
| REQ-SOC-07 | Duplicate detection on (date + member + type) |
| REQ-SOC-08 | Optional **recurring** events (e.g. annual anniversary auto-generated from marriage date on profile) |

**REQ-SOC-10:** Social calendar events appear on member dashboards and committee dashboards.

**REQ-SOC-11:** Mess Secretary can publish calendar for a month; published calendar triggers optional **summary email** to all members.

---

## 11. Monthly mess billing

### 11.1 Billing cycle

- **REQ-BIL-01:** Default cycle **26th to 25th** (configurable per unit).
- **REQ-BIL-02:** Due date configurable (stakeholder input needed: 25th vs 10th of following month).
- **REQ-BIL-03:** One **mess bill per member** per billing period.

### 11.2 Bill components

| Component | Source |
|-----------|--------|
| Messing | Flat rate or P-register sum |
| Bar | Finalized member bar chits in period |
| Guest rooms | Officer-charged room bills |
| Guest meals | Casual guest meals hosted by member |
| Parties | Individual party settlement |
| Subscriptions | Mess maintenance, sports, library, etc. |
| Misc | Personal recovery, damage, laundry, other debits |
| Arrears | Prior unpaid balance |

### 11.3 Workflow

| ID | Requirement |
|----|-------------|
| REQ-BIL-10 | Open billing period → run calculation engine → **draft** bills per member |
| REQ-BIL-11 | Mess Secretary drafts; PMC/Secretary **publish** |
| REQ-BIL-12 | Member views itemized bill (replace mock `/billing`) |
| REQ-BIL-13 | Record payment (amount, method, reference); support partial payments / arrears |
| REQ-BIL-14 | PDF/print statement export using unit's selected **bill format template** (§2.4) |
| REQ-BIL-15 | Granular line items retained for audit (`mess_bill_line_items`) |
| REQ-BIL-16 | On **publish**, email each member their mess bill PDF (or secure link) via transactional email (`profiles.email`) |
| REQ-BIL-17 | Email batch: idempotent per (bill_id, member); retry failed sends; audit log of delivery |
| REQ-BIL-18 | Optional: copy to Mess Secretary / PMC on publish summary |
| REQ-BIL-19 | Member portal shows same bill as emailed attachment |

---

## 12. Reports & analytics

| ID | Requirement |
|----|-------------|
| REQ-RPT-01 | Unit reports (`reports.unit`): messing P-rate trend, bar sales, ration net, guest room revenue, outstanding dues |
| REQ-RPT-02 | Cross-unit reports for platform admin (`reports.cross_unit`) |
| REQ-RPT-03 | President dashboard aggregates without edit actions |
| REQ-RPT-04 | Export ration/monthly formats per Indian mess conventions (templates to be supplied) |

---

## 13. Communications & scheduled notifications

Transactional email infrastructure exists (Resend). Extend for operational comms.

### 13.1 Email types

| Email | Trigger | Recipients |
|-------|---------|------------|
| Monthly mess bill | Bill published (§11) | Each billed member |
| Social reminder | Scheduled daily job | Member(s) linked to event |
| Bill of fare published | Menu approved for upcoming day(s) | All dining members (optional) |
| Guest room booking confirm | Booking created/confirmed | Guest email + sponsor |
| Approval request | Register/menu pending approval | Food Member / PMC |
| Invite / password reset | Auth flows | Individual (existing) |

### 13.2 Scheduled jobs (cron)

**REQ-NOTIF-01:** Platform runs a **daily scheduler** (per unit timezone) that evaluates due notifications.

**REQ-NOTIF-02:** Social calendar reminders: configurable lead time (e.g. 7 days, 1 day, day-of) per event type; send to honoree + optionally all members for mess-wide events.

**REQ-NOTIF-03:** Unit admin configures which reminder schedules are active (`anniversary`: 7d + 1d; `mess_party`: 3d; etc.).

**REQ-NOTIF-04:** Dedupe: same event + lead time + recipient sent only once (`notification_log` table).

**REQ-NOTIF-05:** Failed emails retried with backoff; visible in admin notification log.

**REQ-NOTIF-06:** Members may opt out of **non-mandatory** reminders (not monthly bill — that is official notice).

**REQ-NOTIF-07:** Implementation options: Supabase Edge Function + pg_cron, Vercel Cron, or queue worker — must support multi-tenant batch across all units on platform.

### 13.3 Excel import (social calendar)

**REQ-NOTIF-10:** Reuse bulk-import pattern from masters/ration: paste or upload `.xlsx`, preview rows, validate profiles exist, commit batch.

**REQ-NOTIF-11:** Import does not send emails immediately unless user checks "send reminders for imported events".

---

## 14. Security & compliance

| ID | Requirement |
|----|-------------|
| REQ-SEC-01 | RLS on all operational tables by `unit_id` |
| REQ-SEC-02 | Server-side capability check on every mutation |
| REQ-SEC-03 | Audit log for masters, profiles, bills, appointments, approvals |
| REQ-SEC-04 | Super admin writes require AAL2 where configured |
| REQ-SEC-05 | President read access must not leak other units' data |

---

## 15. Implementation status (gap summary)

| Area | Requirements | Current state |
|------|--------------|---------------|
| Appointments model | §3 | Partial — UI lists food/wine/property members; **no DB appointments table**; single `profiles.role` |
| President (CO) dashboard | §4 | Mock `/dashboard` only |
| Guest rooms | §5 | ~70% — missing sponsor, payment, bar rollup, API |
| Daily messing register approval | §6 | Schema for expenditure exists; **no approval workflow UI** |
| Bar / wine governance | §7 | Bar ops built; finalize + Wine Member audit missing |
| Master data / global catalog | §2.5 | Phase 0 redesign approved — adoption table + purge pending |
| Ration | §8 | Scales + manual consumption; no cron; ledger not decremented on post |
| Parties | §10 | Placeholder page only |
| Monthly mess bill | §11 | Schema + engine on disk; **UI mock**; sponsor field mismatch |
| Reports | §12 | Not built |
| SaaS onboarding | §2 | Manual; no module flags |
| Committee meetings & minutes | §3.4 | Not built |
| Bill of fare | §3.5 | Not built |
| Unit bill format templates | §2.4 | Not built; billing mode only in Settings |
| Monthly bill email | §11, §13 | Resend exists; no bill email job |
| Social calendar | §10.3 | Not built |
| Scheduled reminder cron | §13 | Not built |
| Excel import (social) | §10.3 | Pattern exists in masters/ration; not for calendar |

---

## 16. Release traceability

> **Phase plan & blockers:** [`FOUNDATION.md`](./FOUNDATION.md) §5 · **Field specs:** [`phases/`](./phases/)

| Phase | Requirements sections |
|-------|----------------------|
| **Phase 0** — Foundation | §2.5 REQ-MD-* (catalog redesign, adoption, purge) |
| **Phase 1** — Guest rooms | §5, REQ-DASH-04 (property widgets), REQ-GR-* |
| **Phase 2** — Ration | §8, REQ-RAT-*, REQ-PLAT-20 |
| **Phase 3** — Kitchen & messing | §6, REQ-MES-*, REQ-GOV-21 |
| **Phase 4** — Monthly billing | §11, REQ-BIL-* |
| **Phase 5** — Governance & SaaS | §3, §4, §2, §2.5 (REQ-MD-03 adoption), REQ-GOV-*, REQ-PTY-* |
| **Phase 7** — Cross-unit analytics | §2.5 (REQ-MD-10), §12 REQ-RPT-02 |
| **Phase 6** — Committee, menu, comms | §3.4–§3.5, §10.3, §13, REQ-CFG-*, REQ-BIL-16–19 |

**Recommended parallel track:** **Appointments & dashboards** (§3–§4) should begin early — seed catalog + assignment UI — so each release ships with correct visibility, not only backend logic.

**Phase 6** can start after Phase 4 billing publish — monthly bill email depends on real bills + PDF templates.

---

## 17. Glossary

| Term | Meaning |
|------|---------|
| **Unit** | One mess (tenant) |
| **Appointment** | Named committee position (Food Member, PMC, …) assigned to a person |
| **Capability** | Fine-grained permission (e.g. `billing.finalize`) |
| **P-register / P-rate** | Daily messing cost split: total kitchen spend ÷ diners present |
| **Mess bill** | Monthly consolidated statement for a member (26th–25th) |
| **Room bill** | Per guest-stay bill; may be guest-paid or officer-charged |
| **Mess fund** | Collective mess finances; mess-funded parties draw from it |
| **PMC** | President, Mess Committee — executive committee head |
| **President (CO)** | Commanding Officer — honorary chairman |
| **Mess Havildar** | Senior NCO running daily messing operations |
| **Bill of fare** | Approved daily menu for the mess |
| **Mess Committee** | Elected/appointed body setting mess policy; meets formally with minutes |
| **Social calendar** | Anniversaries, birthdays, and social events with reminder emails |

---

## 18. Open questions

| # | Question | Owner |
|---|----------|-------|
| OQ-01 | Billing due date: 25th or 10th of following month? | Product |
| OQ-02 | Guest payment: record-only vs payment gateway in Phase 1? | Product |
| OQ-03 | Default food charge on guest check-in: fixed or configurable? | Product |
| OQ-04 | P-register: is havildar roll-call equivalent to breakfast pre-register? | Domain expert |
| OQ-05 | Standard ration / mess report PDF templates — provide samples | Domain expert |
| OQ-06 | Garden module scope: budget only or work orders / vendors? | Product |
| OQ-07 | Purchase approval monetary thresholds per unit? | Product |
| OQ-08 | Bill format: platform template library only, or custom upload per unit? | Product |
| OQ-09 | Bill of fare: Food Member approval sufficient, or always committee meeting reference? | Domain expert |
| OQ-10 | Social reminders: which event types and lead times are mandatory defaults? | Product |
| OQ-11 | Monthly bill email: PDF attachment vs secure link (PII)? | Product / Security |
| OQ-12 | Recurring anniversaries: store marriage date on profile vs manual calendar only? | Product |

---

## 19. Document history

| Date | Change |
|------|--------|
| 2026-09-09 | Initial consolidated requirements: SaaS, billing, guest rooms, ration, appointments, parties, dashboards |
| 2026-09-09 | Added: committee meetings & minutes, bill of fare, unit bill formats, monthly bill emails, social calendar, Excel import, scheduled reminder cron |
