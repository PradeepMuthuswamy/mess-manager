-- 20260512080013_guest_rooms.sql

-- 1. Extend item_category (idempotent — also added by 0013_item_category_room
-- in a parallel branch; whichever applies first wins).
alter type public.item_category add value if not exists 'room';

-- 2. Rooms Table
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete restrict,
  name        text not null,
  room_type_id uuid references public.items(id) on delete set null, -- Points to an item in 'room' category for rate
  status      text not null default 'available' check (status in ('available', 'maintenance', 'occupied')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rooms_name_unique_per_unit unique (unit_id, name)
);
create index rooms_unit_idx on public.rooms(unit_id);
create index rooms_status_idx on public.rooms(status);

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function app.set_updated_at();

-- 3. Bookings Table
create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references public.units(id) on delete restrict,
  room_id        uuid not null references public.rooms(id) on delete restrict,
  guest_name     text not null,
  guest_rank     text,
  check_in_date  date not null,
  check_out_date date not null,
  actual_check_in  timestamptz,
  actual_check_out timestamptz,
  status         text not null default 'confirmed' check (status in ('confirmed', 'checked_in', 'checked_out', 'cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  constraint bookings_dates_check check (check_out_date > check_in_date)
);
create index bookings_unit_idx on public.bookings(unit_id);
create index bookings_room_idx on public.bookings(room_id);
create index bookings_dates_idx on public.bookings(check_in_date, check_out_date);
create index bookings_status_idx on public.bookings(status);

create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function app.set_updated_at();

-- 4. Room Bills Table
create table public.room_bills (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references public.units(id) on delete restrict,
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  total_amount   numeric(12,2) not null default 0,
  status         text not null default 'draft' check (status in ('draft', 'finalized', 'paid')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index room_bills_unit_idx on public.room_bills(unit_id);
create index room_bills_booking_idx on public.room_bills(booking_id);
create index room_bills_status_idx on public.room_bills(status);

create trigger room_bills_set_updated_at
before update on public.room_bills
for each row execute function app.set_updated_at();

-- 5. Room Bill Items Table (for charges)
create table public.room_bill_items (
  id             uuid primary key default gen_random_uuid(),
  bill_id        uuid not null references public.room_bills(id) on delete cascade,
  category       text not null check (category in ('room_rent', 'food', 'misc')),
  description    text not null,
  amount         numeric(12,2) not null,
  quantity       numeric(12,2) not null default 1,
  item_id        uuid references public.items(id), -- Optional, if linked to a master item
  created_at     timestamptz not null default now()
);
create index room_bill_items_bill_idx on public.room_bill_items(bill_id);

-- 6. Add audit triggers
create trigger audit_rooms after insert or update or delete on public.rooms for each row execute function app.audit_trigger();
create trigger audit_bookings after insert or update or delete on public.bookings for each row execute function app.audit_trigger();
create trigger audit_room_bills after insert or update or delete on public.room_bills for each row execute function app.audit_trigger();
create trigger audit_room_bill_items after insert or update or delete on public.room_bill_items for each row execute function app.audit_trigger();

-- 7. RLS Policies

alter table public.rooms enable row level security;
alter table public.bookings enable row level security;
alter table public.room_bills enable row level security;
alter table public.room_bill_items enable row level security;

-- Rooms policies
create policy rooms_select on public.rooms
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

create policy rooms_write on public.rooms
  for all to authenticated
  using (app.has_capability('rooms.manage', unit_id))
  with check (app.has_capability('rooms.manage', unit_id));

-- Bookings policies
create policy bookings_select on public.bookings
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

create policy bookings_write on public.bookings
  for all to authenticated
  using (app.has_capability('rooms.booking.write', unit_id))
  with check (app.has_capability('rooms.booking.write', unit_id));

-- Room Bills policies
create policy room_bills_select on public.room_bills
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

create policy room_bills_write on public.room_bills
  for all to authenticated
  using (app.has_capability('rooms.booking.write', unit_id))
  with check (app.has_capability('rooms.booking.write', unit_id));

-- Room Bill Items policies
create policy room_bill_items_select on public.room_bill_items
  for select to authenticated
  using (exists (
    select 1 from public.room_bills b
     where b.id = room_bill_items.bill_id
       and (app.is_admin() or b.unit_id = app.current_unit_id())
  ));

create policy room_bill_items_write on public.room_bill_items
  for all to authenticated
  using (exists (
    select 1 from public.room_bills b
     where b.id = room_bill_items.bill_id
       and app.has_capability('rooms.booking.write', b.unit_id)
  ))
  with check (exists (
    select 1 from public.room_bills b
     where b.id = room_bill_items.bill_id
       and app.has_capability('rooms.booking.write', b.unit_id)
  ));
