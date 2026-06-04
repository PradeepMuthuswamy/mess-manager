-- 20260512080035_room_bill_orders.sql
--
-- Billing enrichment: grouped adhoc orders, food meal-type, negative misc
-- (discounts). Mirrors the RLS / audit conventions of
-- 20260512080024_guest_rooms.sql. Reuses rooms.booking.write / rooms.read.

-- 1. Adhoc order header (groups child room_bill_items, e.g. a 3pm snack)
create table public.room_bill_orders (
  id          uuid primary key default gen_random_uuid(),
  bill_id     uuid not null references public.room_bills(id) on delete cascade,
  label       text not null,
  occurred_at timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index room_bill_orders_bill_idx on public.room_bill_orders(bill_id);

create trigger room_bill_orders_set_updated_at
before update on public.room_bill_orders
for each row execute function app.set_updated_at();

create trigger audit_room_bill_orders
after insert or update or delete on public.room_bill_orders
for each row execute function app.audit_trigger();

-- 2. Extend room_bill_items: meal type, order grouping, adhoc category,
--    allow negative amounts (discounts).
alter table public.room_bill_items
  add column meal_type text
    check (meal_type in ('breakfast', 'lunch', 'dinner'));

alter table public.room_bill_items
  add column order_id uuid
    references public.room_bill_orders(id) on delete cascade;

create index room_bill_items_order_idx on public.room_bill_items(order_id);

alter table public.room_bill_items
  drop constraint room_bill_items_category_check;

alter table public.room_bill_items
  add constraint room_bill_items_category_check
  check (category in ('room_rent', 'food', 'adhoc', 'misc'));

-- 3. RLS — scoped through the parent bill's unit, same shape as the
--    room_bill_items -> room_bills policy in the guest_rooms migration.
alter table public.room_bill_orders enable row level security;

create policy room_bill_orders_select on public.room_bill_orders
  for select to authenticated
  using (exists (
    select 1 from public.room_bills b
     where b.id = room_bill_orders.bill_id
       and (app.is_admin() or b.unit_id = app.current_unit_id())
  ));

create policy room_bill_orders_write on public.room_bill_orders
  for all to authenticated
  using (exists (
    select 1 from public.room_bills b
     where b.id = room_bill_orders.bill_id
       and app.has_capability('rooms.booking.write', b.unit_id)
  ))
  with check (exists (
    select 1 from public.room_bills b
     where b.id = room_bill_orders.bill_id
       and app.has_capability('rooms.booking.write', b.unit_id)
  ));
