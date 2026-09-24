-- ===========================================================================
-- Guest Rooms Integrity & Performance
-- ===========================================================================
-- Fixes:
--   C1  EXCLUDE USING gist to prevent double-booking at the DB level
--   C2  Atomic check-in / check-out PG functions
--   O1  v_rooms_current lateral-join optimisation
--   O4  Drop redundant room_bills_booking_idx (covered by UNIQUE)
-- ===========================================================================

-- -----------------------------------------------------------------------
-- C1 — Exclusion constraint on bookings to prevent overlapping stays
-- -----------------------------------------------------------------------
create extension if not exists btree_gist;

alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    room_id  with =,
    daterange(check_in_date, check_out_date) with &&
  )
  where (status <> 'cancelled');

-- -----------------------------------------------------------------------
-- C2 — Atomic check-in: booking → bill → tariff items in one transaction
-- -----------------------------------------------------------------------
create or replace function public.check_in_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking  record;
  v_room     record;
  v_food     numeric;
  v_bill_id  uuid;
  v_nights   int;
begin
  -- Lock the booking row to prevent concurrent check-ins
  select *
    into strict v_booking
    from public.bookings
   where id = p_booking_id
     for update;

  if v_booking.status <> 'confirmed' then
    raise exception 'Only confirmed bookings can be checked in (current: %)', v_booking.status
      using errcode = 'P0001';
  end if;

  -- Fetch room details
  select room_type, nightly_rate
    into strict v_room
    from public.rooms
   where id = v_booking.room_id;

  -- Fetch unit food tariff
  select coalesce(u.guest_food_per_night, 0)
    into v_food
    from public.units u
   where u.id = v_booking.unit_id;

  v_nights := greatest(1, v_booking.check_out_date - v_booking.check_in_date);

  -- Step 1: flip booking status
  update public.bookings
     set status          = 'checked_in',
         actual_check_in = now()
   where id = p_booking_id;

  -- Step 2: create draft bill
  insert into public.room_bills (unit_id, booking_id, status)
  values (v_booking.unit_id, p_booking_id, 'draft')
  returning id into v_bill_id;

  -- Step 3: seed tariff lines (room rent + food)
  insert into public.room_bill_items (bill_id, category, description, amount, quantity)
  values
    (v_bill_id, 'room_rent',
     format('Room Rent - %s (%s nights)', v_room.room_type, v_nights),
     v_room.nightly_rate, v_nights),
    (v_bill_id, 'food',
     format('Food Bill (all meals) (%s days)', v_nights),
     v_food, v_nights);

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'bill_id',    v_bill_id,
    'room_id',    v_booking.room_id,
    'unit_id',    v_booking.unit_id
  );
end;
$$;

grant execute on function public.check_in_booking(uuid) to authenticated;

-- -----------------------------------------------------------------------
-- C2 — Atomic check-out: booking + bill finalisation in one transaction
-- -----------------------------------------------------------------------
create or replace function public.finalize_checkout(
  p_booking_id      uuid,
  p_settlement_type public.guest_settlement_type,
  p_host_profile_id uuid     default null,
  p_folio_number    text     default null,
  p_paid_amount     numeric  default null,
  p_payment_method  text     default null,
  p_payment_ref     text     default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking   record;
  v_bill      record;
  v_total     numeric;
  v_is_direct boolean;
begin
  -- Lock booking
  select *
    into strict v_booking
    from public.bookings
   where id = p_booking_id
     for update;

  if v_booking.status <> 'checked_in' then
    raise exception 'Only checked-in bookings can be checked out (current: %)', v_booking.status
      using errcode = 'P0001';
  end if;

  -- Require host when charging to mess bill
  if p_settlement_type = 'CHARGE_TO_HOST'
     and p_host_profile_id is null
     and v_booking.host_profile_id is null
  then
    raise exception 'Cannot transfer bill to mess account: No sponsoring host officer assigned'
      using errcode = 'P0001';
  end if;

  -- Lock the bill
  select *
    into strict v_bill
    from public.room_bills
   where booking_id = p_booking_id
     for update;

  -- Compute total from all bill items
  select coalesce(sum(amount * quantity), 0)
    into v_total
    from public.room_bill_items
   where bill_id = v_bill.id;

  v_is_direct := (p_settlement_type = 'DIRECT_SETTLEMENT');

  -- Step 1: update booking
  update public.bookings
     set status           = 'checked_out',
         actual_check_out = now(),
         settlement_type  = p_settlement_type,
         host_profile_id  = coalesce(p_host_profile_id, host_profile_id)
   where id = p_booking_id;

  -- Step 2: finalize bill (atomic with step 1)
  update public.room_bills
     set status            = case when v_is_direct then 'paid' else 'transferred_to_mess_bill' end,
         total_amount      = v_total,
         settlement_type   = p_settlement_type,
         payment_status    = case when v_is_direct
                               then 'paid'::public.room_bill_payment_status
                               else 'transferred_to_mess_bill'::public.room_bill_payment_status
                             end,
         paid_amount       = case when v_is_direct then coalesce(p_paid_amount, v_total) else 0 end,
         paid_at           = case when v_is_direct then now() else null end,
         payment_method    = case when v_is_direct then coalesce(p_payment_method, 'cash') else null end,
         payment_reference = case when v_is_direct then p_payment_ref else null end,
         folio_number      = p_folio_number
   where id = v_bill.id;

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'bill_id',    v_bill.id,
    'room_id',    v_booking.room_id,
    'unit_id',    v_booking.unit_id,
    'total',      v_total
  );
end;
$$;

grant execute on function public.finalize_checkout(
  uuid, public.guest_settlement_type, uuid, text, numeric, text, text
) to authenticated;

-- -----------------------------------------------------------------------
-- O1 — Optimise v_rooms_current: lateral join instead of correlated subs
-- -----------------------------------------------------------------------
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
    when r.status = 'maintenance'    then 'maintenance'
    when r.status = 'out_of_service' then 'out_of_service'
    when ab.booking_status = 'checked_in' then 'occupied'
    when ab.booking_status = 'confirmed'  then 'reserved'
    else 'vacant'
  end as current_status,
  ab.id as current_booking_id
from public.rooms r
left join lateral (
  select b.id, b.status as booking_status
    from public.bookings b
   where b.room_id = r.id
     and b.status in ('checked_in', 'confirmed')
     and current_date >= b.check_in_date
     and current_date <  b.check_out_date
   order by case b.status when 'checked_in' then 0 else 1 end
   limit 1
) ab on true;

grant select on public.v_rooms_current to authenticated;

-- -----------------------------------------------------------------------
-- O4 — Drop redundant index (covered by the UNIQUE constraint)
-- -----------------------------------------------------------------------
drop index if exists public.room_bills_booking_idx;
