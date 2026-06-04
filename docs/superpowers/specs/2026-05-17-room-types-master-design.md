# Room Types Master (Guest-Rooms-only, admin/unit_admin managed)

Date: 2026-05-17
Status: Approved — execute all phases, autonomous.

## Decisions
- Reuse `items` (`category='room'`) + `set_item_rate`/`item_versions`. No new table.
- Per-unit; manageable by global `admin` and the unit's `unit_admin`. Managers/users cannot.
- Fields: name + nightly rate (rate versioned via `set_item_rate`).
- Surfaced only inside Guest Rooms (a gated 4th tab). `/masters` still excludes `room`.

## Migration `20260512080036_room_type_rls.sql`
`set_item_rate` is `security invoker`; existing `items_write` / `item_versions_write`
only allow `app.is_admin()` or `masters.write[.global]` capability holders — a
`unit_admin` without that capability is blocked. Add two ADDITIVE permissive
policies (Postgres OR-combines permissive `FOR ALL` policies → non-breaking):

- `items_room_write` on `public.items`:
  `for all to authenticated`
  `using/with check ( category = 'room' AND ( app.is_admin() OR ( app.current_role() = 'unit_admin' AND unit_id = app.current_unit_id() ) ) )`
- `item_versions_room_write` on `public.item_versions`: same gate via
  `exists (select 1 from public.items i where i.id = item_versions.item_id and i.category = 'room' and ( app.is_admin() or ( app.current_role() = 'unit_admin' and i.unit_id = app.current_unit_id() ) ))`
  (mirrors the shape of the existing `item_versions_write`).

Helpers `app.is_admin()`, `app.current_role()`, `app.current_unit_id()` already
exist (SECURITY DEFINER, granted to authenticated). No new helper.

## Server — `lib/guest-rooms/room-types.ts` (`server-only`)
- `getRoomTypes(unitId)` — reuse `listMasterItems('room', { activeUnitId: unitId, isAllUnits: false })`.
- `createRoomTypeAction({ unit_id, name, rate })`
- `renameRoomTypeAction(id, name)`
- `setRoomTypeRateAction(id, rate)`
Each: first line `await requireRole(['admin','unit_admin'])`; resolve the caller's
unit (`getCurrentUser()` — admin → `activeUnitId`, unit_admin → `homeUnitId`/active)
and assert the target `unit_id` equals it (defence-in-depth beyond RLS). Writes go
through the `set_item_rate` RPC (create + rate) and `items` update (rename), the
same path masters uses. Item triggers handle audit. `revalidatePath('/guest-rooms')`.
`roomTypeSchema` (`unit_id` uuid, `name` 1..100, `rate` coerce number ≥ 0) added to
`lib/schemas/guest-rooms.ts` with `.openapi('RoomTypeInput')` + inferred type.

## UI
- `app/(app)/guest-rooms/_components/room-types-tab.tsx` (client): table
  (Name · Rate/night · Edit) + `AdaptiveModal` form (name + ₹ rate). Create uses
  `createRoomTypeAction`; edit a row → rename + (if changed) `setRoomTypeRateAction`.
  Empty state + toasts, semantic tokens only, no `modalStyle` prop (context).
- `app/(app)/guest-rooms/_components/room-types-list.tsx` (server): fetch
  `getRoomTypes(activeUnitId)`, render the tab; `ErrorState` on failure.
- `guest-rooms/page.tsx`: compute `canManageRoomTypes = user.role === 'admin' || user.role === 'unit_admin'`. Add a 4th `TabsTrigger value="room-types"` and matching
  `TabsContent` ONLY when `canManageRoomTypes` (both gated). Non-admins never see it.
  The page already calls `requireCapability('rooms.read')`; the tab's server/actions
  add the `requireRole(['admin','unit_admin'])` gate.

The Add-Room picker (`listMasterItems('room',…)` via `rooms-list.tsx`) already shows
room types — defining types makes them appear automatically; billing's check-in
rate lookup (`item_versions`) is unchanged.

## Verification
tsc 0 errors · lint no new rule classes · ds-audit PASS on touched paths ·
Supabase security advisors: no `rls_enabled_no_policy`/new findings for the new
policies · manual: unit_admin defines a type → appears in Add-Room → check-in bills
the rate; a `manager`/`user` sees no Room Types tab and the actions 403.

## Execution
- Phase 1 (orchestrator): migration → MCP apply → `db:reset` + `db:types`.
- Phase 2 (parallel agents): (a) schema + `room-types.ts` server actions;
  (b) `room-types-tab.tsx` + `room-types-list.tsx`; (c) `page.tsx` gated tab wiring.
- Phase 3 (orchestrator): integrate, full verify, fix fallout.
