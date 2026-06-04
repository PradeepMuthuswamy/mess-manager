-- Tracking room occupancy via a manually-updated `rooms.status` column is
-- a classic source-of-truth bug in property-management systems: a missed
-- trigger or a network blip leaves the room "occupied" forever. The PMS
-- industry pattern is to:
--
--   * keep `rooms.status` for OPERATIONAL state only — set explicitly by
--     housekeeping/admin when a room needs maintenance or is offline.
--     Allowed values: 'available' | 'maintenance' | 'out_of_service'.
--   * DERIVE current occupancy at read time from `bookings`. A room is
--     "occupied" iff a booking with status='checked_in' covers today,
--     "reserved" iff a 'confirmed' booking covers today, otherwise vacant.
--   * DERIVE future-range availability at read time via a function —
--     used by the booking form to validate before insert.
--
-- This migration drops the 'occupied' value from `rooms.status`, exposes
-- a `v_rooms_current` view with the derived columns, and adds
-- `app.is_room_available()` for the availability check.

-- 1. Normalise any rows that were already set to 'occupied'. Occupancy
--    becomes a derived attribute, so existing operational state collapses
--    to 'available'.
update public.rooms
   set status = 'available'
 where status = 'occupied';

-- 2. Swap the check constraint.
alter table public.rooms drop constraint rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check
  check (status in ('available', 'maintenance', 'out_of_service'));
alter table public.rooms
  alter column status set default 'available';

-- 3. View exposing the derived snapshot. Use `security_invoker = on` so
--    the view inherits the caller's RLS on rooms / bookings — no privilege
--    escalation, no need for separate policies on the view itself.
create or replace view public.v_rooms_current
with (security_invoker = on)
as
select
  r.id,
  r.unit_id,
  r.name,
  r.room_type_id,
  r.status,
  r.created_at,
  r.updated_at,
  case
    when r.status = 'maintenance'     then 'maintenance'
    when r.status = 'out_of_service'  then 'out_of_service'
    when exists (
      select 1 from public.bookings b
       where b.room_id = r.id
         and b.status = 'checked_in'
         and current_date >= b.check_in_date
         and current_date <  b.check_out_date
    ) then 'occupied'
    when exists (
      select 1 from public.bookings b
       where b.room_id = r.id
         and b.status = 'confirmed'
         and current_date >= b.check_in_date
         and current_date <  b.check_out_date
    ) then 'reserved'
    else 'vacant'
  end as current_status,
  (
    select b.id from public.bookings b
     where b.room_id = r.id
       and b.status in ('checked_in', 'confirmed')
       and current_date >= b.check_in_date
       and current_date <  b.check_out_date
     order by case b.status
                when 'checked_in' then 0
                when 'confirmed'  then 1
              end
     limit 1
  ) as current_booking_id
from public.rooms r;

comment on view public.v_rooms_current is
  'rooms joined with derived current occupancy. Use this for read-side queries that need a single "current state" per room. Operational status lives on rooms.status; occupancy is computed from bookings.';

grant select on public.v_rooms_current to authenticated;

-- 4. Server-side availability check. Encapsulates the date-overlap rule
--    so the booking flow and any future bulk import use the same logic.
create or replace function app.is_room_available(
  p_room_id            uuid,
  p_check_in           date,
  p_check_out          date,
  p_exclude_booking_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
      from public.bookings b
     where b.room_id = p_room_id
       and b.status <> 'cancelled'
       and b.check_in_date  <  p_check_out
       and b.check_out_date >  p_check_in
       and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
  );
$$;

grant execute on function app.is_room_available(uuid, date, date, uuid)
  to authenticated;

-- 5. Bookings that span check-in/check-out should also write to
--    actual_check_in/actual_check_out (already in the schema). The
--    existing checkInAction / checkOutAction set these — confirm they
--    do NOT mutate rooms.status. Documentation:
--
--    DO NOT update public.rooms.status from booking transitions. The
--    view derives occupancy from bookings; manual updates would create
--    drift. rooms.status is for housekeeping/maintenance only.
