# App-wide Modal Sweep + Guest-Room Billing Enrichment

Date: 2026-05-17
Status: Approved — execute all phases, 20-30 parallel agents, autonomous (no checkpoints)

## Workstream 1 — Context-based modal sweep

Goal: the `modal_style` Settings preference (`dialog` default | `sheet`) governs **every**
overlay form in the app, not just guest-rooms.

- New `lib/preferences/modal-style-context.tsx`: `'use client'` — `ModalStyleProvider`
  + `useModalStyle()` hook (context default `'dialog'`).
- `app/(app)/layout.tsx` (server): `const { modal_style } = await readUiPreferences();`
  wrap children in `<ModalStyleProvider value={modal_style}>`.
- `components/shared/adaptive-modal.tsx`: make `modalStyle?: ModalStyle` optional;
  when omitted, resolve from `useModalStyle()`. Keep explicit prop as override.
- Retrofit guest-rooms: drop the `modalStyle` prop thread added 2026-05-17
  (page.tsx, rooms-list, rooms-table, bookings-table, bookings-list, room-form,
  booking-form) — they rely on context now. Net simplification.
- Sweep every overlay component to `AdaptiveModal`, preserving each one's bespoke
  width / classes via `contentClassName`. Components (≈22):
  - inventory: add-lot-dialog, edit-lot-dialog, add-master-item-dialog, add-pack-size-dialog
  - masters: master-form-dialog, master-bulk-import-dialog, master-history-dialog, master-multi-edit-dialog
  - ration: new-scale-dialog, edit-scale-dialog, bulk-update-dialog, bulk-import-scale-dialog, version-history-sheet
  - admin: capabilities/template-form-sheet, units/unit-form-sheet, users/capability-grant-sheet, users/user-edit-sheet, users/user-invite-sheet
  - users: dependant-form-sheet, invite-dependant-login-sheet
  - attendance: attendance-roster
  - guest-rooms: billing-dialog (rebuilt in Workstream 2)

Rule: AdaptiveModal owns header (title/description) + optional footer; callers move
their title/description into props and form body into children. Preserve all existing
form logic; only the modal wrapper changes. Semantic tokens only (DS rule).

## Workstream 2 — Billing enrichment

### Migration `20260512080035_room_bill_orders.sql`
- New `public.room_bill_orders`: `id uuid pk, bill_id uuid not null references
  room_bills(id) on delete cascade, label text not null, occurred_at timestamptz
  not null default now(), note text, created_at, updated_at`.
  RLS select/write scoped through parent `room_bills` (same exists-subquery shape as
  `room_bill_items` policies, capability `rooms.booking.write`). `set_updated_at` +
  `app.audit_trigger()` triggers. Indexes on `bill_id`.
- Alter `public.room_bill_items`:
  - add `meal_type text check (meal_type in ('breakfast','lunch','dinner'))` null
  - add `order_id uuid references public.room_bill_orders(id) on delete cascade` null
  - replace the `category` check constraint to allow
    `('room_rent','food','adhoc','misc')`
  - drop any non-negative `amount` check (negative misc = discounts)

### Schemas (`lib/schemas/guest-rooms.ts`)
- `billItemCategorySchema` → `z.enum(['room_rent','food','adhoc','misc'])`.
- `mealTypeSchema = z.enum(['breakfast','lunch','dinner'])`.
- `createBillItemSchema`: add `meal_type: mealTypeSchema.optional().nullable()`,
  `order_id: z.string().uuid().optional().nullable()`; change `amount` to
  `z.coerce.number()` (allow negative); keep `quantity` positive default 1.
- New `createBillOrderSchema`: `{ bill_id: uuid, label: trim min1 max200,
  occurred_at: z.string().datetime().optional(), note: trim max500 nullable optional }`
  `.openapi('CreateBillOrderInput')`. Export inferred types.

### Types (`lib/guest-rooms/types.ts`)
- `BillOrder = Tables['room_bill_orders']['Row']`.
- `BookingWithBill.bill` extended: `orders: (BillOrder & { items: BillItemRow[] })[]`
  alongside the existing flat `items`.

### Queries (`lib/guest-rooms/queries.ts`)
- `getBookingById` bill select extended to also fetch
  `orders:room_bill_orders(*, items:room_bill_items(*))`. Flat `items` still fetched
  (room_rent / food / misc with `order_id is null`).

### Actions (`lib/guest-rooms/actions.ts`)
- `createBillOrderAction(billId, input)` — parse `createBillOrderSchema`; peek bill
  unit + `requireCapability('rooms.booking.write', unit)`; reject if bill not draft;
  insert order; revalidate.
- Extend `addBillItemAction` to persist `meal_type` / `order_id`.
- `deleteBillItemAction(itemId)` and `deleteBillOrderAction(orderId)` — draft-only,
  same capability gate (a billing screen is unusable without correction; minimal).
- All gated explicitly (not RLS-only), audit via trigger.

### UI — `billing-dialog.tsx` rebuilt on `AdaptiveModal`
Sections, each editable only while `bill.status==='draft'`:
1. **Room rent** — `category='room_rent'` items, read-only.
2. **Food** — items `category='food'` grouped by `meal_type`
   (Breakfast / Lunch / Dinner); add-form with meal-type select.
3. **Adhoc orders** — list of `room_bill_orders`; each shows label + `occurred_at`
   and its child items; "New order" creates an order, then add items to it.
   Renders e.g. `Snack · 3:00 PM — Maggi ×1, Cold Coffee ×1`.
4. **Extra charges** — `category='misc'` labelled rows (description = label,
   amount, negative allowed for discounts).
5. **Total** — `Σ amount×quantity` across all items (grouped + ungrouped).
Row/order delete buttons while draft. Checkout finalize path unchanged
(`checkOutAction` already totals `room_bill_items`).

## Verification
- `npx tsc --noEmit` exit 0.
- `npm run lint` — no new rule classes vs. baseline (repo already trips
  `react-hooks/set-state-in-effect` on pre-existing files).
- `scripts/ds-audit.sh` PASS on every touched path.
- Supabase security advisors: no new findings for `room_bill_orders`.
- Manual: check-in → add food (by meal) + an adhoc order with 2 items + an extra
  charge (incl. a negative discount) → total correct → checkout finalizes;
  flip Settings modal style → a swept dialog (e.g. inventory add-lot) switches.

## Execution
- **Phase 1 (blocking, orchestrator):** billing migration → MCP apply →
  `db:reset` + `db:types`; ModalStyleProvider + AdaptiveModal context fallback +
  layout wiring + guest-rooms prop-thread retrofit.
- **Phase 2 (≈20-26 agents, parallel, file-disjoint):** one agent per sweep
  component; separate agents for billing schemas, billing types+queries, billing
  actions.
- **Phase 3:** BillingDialog rebuild (after billing server layer), then full verify
  (tsc, lint, ds-audit, advisors). Orchestrator integrates + fixes fallout.

Deferred/none — this consumes the previously-deferred items (BillingDialog
adaptivity, app-wide sweep).
