-- Phase 1 — folio / bar sync / guest food tariff
-- G-001..G-003, G-009: unique bill per booking, bar lines on folio, unit food rate.

-- ---------------------------------------------------------------------------
-- 1. Unit tariff: guest food per night (not a catalog item)
-- ---------------------------------------------------------------------------
alter table public.units
  add column if not exists guest_food_per_night numeric(12,2) not null default 900
  check (guest_food_per_night >= 0);

comment on column public.units.guest_food_per_night is
  'Tariff domain: default guest-room food charge per night. Not a catalog product.';

-- ---------------------------------------------------------------------------
-- 2. One room bill per booking
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'room_bills_booking_id_key'
  ) then
    alter table public.room_bills
      add constraint room_bills_booking_id_key unique (booking_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Folio may include bar lines linked to a chit
-- ---------------------------------------------------------------------------
alter table public.room_bill_items
  drop constraint if exists room_bill_items_category_check;

alter table public.room_bill_items
  add constraint room_bill_items_category_check
  check (category in ('room_rent', 'food', 'adhoc', 'misc', 'bar'));

alter table public.room_bill_items
  add column if not exists bar_chit_id uuid references public.bar_chits(id) on delete set null;

create unique index if not exists room_bill_items_bar_chit_uidx
  on public.room_bill_items (bar_chit_id)
  where bar_chit_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Unify room_bills.status with settlement outcomes (keep payment_status
--    for existing UI; checkout must write both until UI is updated)
-- ---------------------------------------------------------------------------
alter table public.room_bills
  drop constraint if exists room_bills_status_check;

alter table public.room_bills
  add constraint room_bills_status_check
  check (status in ('draft', 'finalized', 'paid', 'transferred_to_mess_bill'));
