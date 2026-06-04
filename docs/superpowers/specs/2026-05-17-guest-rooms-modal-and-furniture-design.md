# Guest Rooms — Modal Preference Fix + Room Furniture Inventory

Date: 2026-05-17
Status: Approved (execute all 3 phases, parallel agents)

## Problem

1. Settings exposes a `modal_style` preference (`dialog` default | `sheet`) that is
   **consumed nowhere**. `RoomForm`/`BookingForm` hardcode `<Sheet>`, so the Add Room
   form slides in from the side even though the user's saved preference is `dialog`.
2. Add Room only captures name / type / status. There is no way to record the
   physical inventory of a room (furniture, fixtures, equipment).

## Part A — AdaptiveModal (preference plumbing)

- New `components/shared/adaptive-modal.tsx`: one client component with a unified
  API: `{ open, onClose, title, description, footer, children, modalStyle }`.
  - `modalStyle === 'dialog'` → renders `Dialog` + `DialogContent` (+ Header/Footer).
  - `modalStyle === 'sheet'` → renders `Sheet` + `SheetContent` (+ Header/Footer).
  - `sm:max-w-lg` content width, `overflow-y-auto`, `font-sans` (parity with current
    forms). Callers never branch on Sheet/Dialog primitives again.
- `guest-rooms/page.tsx` (server) calls `readUiPreferences()` and threads
  `modalStyle: ModalStyle` through `RoomsList` / `BookingsTable` / `BookingsCalendar`
  → `RoomsTable` → `RoomForm`, and into `BookingForm`.
- `room-form.tsx` and `booking-form.tsx` refactored onto `AdaptiveModal`.
- `billing-dialog.tsx` is intentionally **out of scope** (it is a bill viewer that is
  genuinely a dialog). App-wide modal sweep is a noted follow-up, not built here.

Result: with the default `dialog` preference, Add/Edit Room and New/Edit Booking open
centered; switching Settings → `sheet` slides them in.

## Part B — Unit furniture catalogue + per-room inventory

### Migration `20260512080034_room_furniture.sql`

- `public.unit_furniture` — per-unit catalogue:
  `id uuid pk, unit_id uuid fk units, name text not null,
   kind text not null default 'furniture' check in
   ('furniture','fixture','equipment','other'),
   created_at timestamptz default now()`.
  Unique `(unit_id, lower(name))` to prevent dirty duplicates.
- `public.room_furniture` — per-room counts:
  `id uuid pk, room_id uuid fk rooms on delete cascade,
   furniture_id uuid fk unit_furniture on delete restrict,
   quantity int not null default 1 check (quantity > 0),
   condition text not null default 'good' check in ('good','fair','poor'),
   notes text, created_at timestamptz default now()`.
  Unique `(room_id, furniture_id)`.
- RLS mirrors the existing `20260512080024_guest_rooms.sql` pattern exactly:
  - `unit_furniture`: select = `app.is_admin() or unit_id = app.current_unit_id()`;
    write `for all` guarded by `app.has_capability('rooms.manage', unit_id)`.
  - `room_furniture`: select / write scoped through the parent room's unit via an
    `exists` subquery (same shape as `room_bill_items` → `room_bills`), capability
    `rooms.manage`.
- Both tables wired into `app.audit_trigger()` (after-row, like other business tables).
- No new capability slug — reuses `rooms.read` / `rooms.manage`.

### Server

- `lib/schemas/guest-rooms.ts` — add `furnitureKindSchema`,
  `furnitureConditionSchema`, `createFurnitureItemSchema`
  (`unit_id, name, kind`), `roomInventoryRowSchema`
  (`furniture_id, quantity, condition, notes`). Extend `createRoomSchema` /
  `updateRoomSchema` with optional `inventory: roomInventoryRowSchema[]`.
- `lib/guest-rooms/types.ts` — add client-safe `UnitFurniture`, `RoomFurniture`,
  `RoomInventoryRow` row types.
- `lib/guest-rooms/queries.ts` — `getUnitFurniture(unitId)`,
  `getRoomInventory(roomId)`.
- `lib/guest-rooms/actions.ts` — `createFurnitureItemAction`
  (`requireCapability('rooms.manage', unit_id)` first line). Extend
  `createRoomAction` / `updateRoomAction` to accept `inventory[]` and diff
  `room_furniture` after the room write (delete removed, upsert present). Audit by
  trigger; capability gate is the explicit defence.

### UI

- `room-form.tsx` gains an **Inventory** section: rows of
  `{ furniture (combobox over unit catalogue + inline "add new"), quantity,
  condition (select), notes }`, with add/remove-row controls. New catalogue items
  created via `createFurnitureItemAction`, then selectable without reload. On submit
  the `inventory[]` array is sent with the room payload; edit mode preloads existing
  rows from `getRoomInventory`.

## Verification

- `npm run lint` clean.
- `npx tsc --noEmit` clean.
- DB advisors (`mcp__supabase__get_advisors` security) clean for the new tables.
- Manual smoke: create furniture item → add room with 2 furniture rows → reopen in
  edit (rows present) → toggle Settings modal style → Add Room switches dialog/sheet.
- Repo has no automated test runner; verification is lint + typecheck + manual smoke.

## Execution plan (parallel agents + Supabase MCP)

- **Phase 1 (blocking, orchestrator):** write migration → `mcp__supabase__apply_migration`
  → `npm run db:types` → confirm `unit_furniture` / `room_furniture` in
  `database.types.ts`.
- **Phase 2 (parallel agents, file-disjoint):**
  - Agent S1: `lib/schemas/guest-rooms.ts` (schema additions only).
  - Agent S2: `lib/guest-rooms/types.ts` (row type additions only).
  - Agent U1: `components/shared/adaptive-modal.tsx` (new file).
  - Agent U2: prop threading — `guest-rooms/page.tsx`, `rooms-list.tsx`,
    `bookings-table.tsx`, `bookings-calendar.tsx`, `rooms-table.tsx` (modalStyle only).
- **Phase 3 (parallel where disjoint, then integrate):**
  - Agent Q: `lib/guest-rooms/queries.ts` (after S2).
  - Agent A: `lib/guest-rooms/actions.ts` (after S1).
  - Agent F1: `booking-form.tsx` onto AdaptiveModal (after U1).
  - Agent F2: `room-form.tsx` onto AdaptiveModal + inventory section
    (after U1 + S1 + S2; integrated by orchestrator since it depends on the most).
- **Phase 4 (orchestrator):** `npm run lint`, `npx tsc --noEmit`, DB advisors, fix
  fallout, summarise.

Scope is one phased slice. Deferred (noted, not built): BillingDialog adaptivity,
app-wide modal sweep, furniture in the REST `/api/v1` surface.
