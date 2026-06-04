-- 20260512080034_room_furniture.sql
--
-- Per-unit furniture catalogue + per-room inventory counts.
-- Lets a room record what is physically in it (furniture, fixtures,
-- equipment). Mirrors the RLS / audit / updated_at conventions of
-- 20260512080024_guest_rooms.sql. Reuses the rooms.read / rooms.manage
-- capabilities — no new slug.

-- 1. Unit-level furniture catalogue
create table public.unit_furniture (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.units(id) on delete restrict,
  name       text not null,
  kind       text not null default 'furniture'
             check (kind in ('furniture', 'fixture', 'equipment', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Case-insensitive uniqueness per unit to prevent dirty duplicates.
create unique index unit_furniture_name_unique_per_unit
  on public.unit_furniture (unit_id, lower(name));
create index unit_furniture_unit_idx on public.unit_furniture(unit_id);

create trigger unit_furniture_set_updated_at
before update on public.unit_furniture
for each row execute function app.set_updated_at();

create trigger audit_unit_furniture
after insert or update or delete on public.unit_furniture
for each row execute function app.audit_trigger();

-- 2. Per-room inventory counts
create table public.room_furniture (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  furniture_id uuid not null references public.unit_furniture(id) on delete restrict,
  quantity     int not null default 1 check (quantity > 0),
  condition    text not null default 'good'
               check (condition in ('good', 'fair', 'poor')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint room_furniture_unique_per_room unique (room_id, furniture_id)
);
create index room_furniture_room_idx on public.room_furniture(room_id);
create index room_furniture_furniture_idx on public.room_furniture(furniture_id);

create trigger room_furniture_set_updated_at
before update on public.room_furniture
for each row execute function app.set_updated_at();

create trigger audit_room_furniture
after insert or update or delete on public.room_furniture
for each row execute function app.audit_trigger();

-- 3. RLS

alter table public.unit_furniture enable row level security;
alter table public.room_furniture enable row level security;

-- unit_furniture: unit-scoped read; write gated on rooms.manage for the unit.
create policy unit_furniture_select on public.unit_furniture
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

create policy unit_furniture_write on public.unit_furniture
  for all to authenticated
  using (app.has_capability('rooms.manage', unit_id))
  with check (app.has_capability('rooms.manage', unit_id));

-- room_furniture: scoped through the parent room's unit, same shape as
-- the room_bill_items -> room_bills policy in the guest_rooms migration.
create policy room_furniture_select on public.room_furniture
  for select to authenticated
  using (exists (
    select 1 from public.rooms r
     where r.id = room_furniture.room_id
       and (app.is_admin() or r.unit_id = app.current_unit_id())
  ));

create policy room_furniture_write on public.room_furniture
  for all to authenticated
  using (exists (
    select 1 from public.rooms r
     where r.id = room_furniture.room_id
       and app.has_capability('rooms.manage', r.unit_id)
  ))
  with check (exists (
    select 1 from public.rooms r
     where r.id = room_furniture.room_id
       and app.has_capability('rooms.manage', r.unit_id)
  ));
