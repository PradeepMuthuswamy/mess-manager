-- Drop the existing view that references room_type_id
drop view if exists public.v_rooms_current;

-- Clean up any existing references to rooms category in room_bill_items
update public.room_bill_items
   set item_id = null
 where item_id in (select id from public.items where category = 'room');

-- Alter table public.rooms
alter table public.rooms drop constraint if exists rooms_room_type_id_fkey;
alter table public.rooms drop column if exists room_type_id;

-- Add column room_type and nightly_rate
alter table public.rooms add column if not exists room_type text not null default 'Standard' check (room_type in ('Standard', 'Deluxe', 'Executive', 'Suite', 'VIP'));
alter table public.rooms add column if not exists nightly_rate numeric(12,2) not null default 0;

-- Re-create the view using the new direct columns
create or replace view public.v_rooms_current
with (security_invoker = on)
as
select
  r.id,
  r.unit_id,
  r.name,
  r.room_type,
  r.nightly_rate,
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

-- Clean up items of category 'room' from items and item_versions
delete from public.item_versions iv
using public.items i
where iv.item_id = i.id
  and i.category = 'room';

delete from public.items
where category = 'room';
