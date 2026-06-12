-- Create bar_chits table
create table public.bar_chits (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units(id) on delete restrict,
  date         date not null default current_date,
  profile_id   uuid references public.profiles(id) on delete set null,
  guest_name   text,
  booking_id   uuid references public.bookings(id) on delete set null,
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  status       text not null default 'pending' check (status in ('pending', 'finalized')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);

create index bar_chits_unit_idx on public.bar_chits(unit_id);
create index bar_chits_profile_idx on public.bar_chits(profile_id);
create index bar_chits_booking_idx on public.bar_chits(booking_id);
create index bar_chits_status_idx on public.bar_chits(status);
create index bar_chits_date_idx on public.bar_chits(date);

create trigger bar_chits_set_updated_at
before update on public.bar_chits
for each row execute function app.set_updated_at();

-- Create bar_chit_items table
create table public.bar_chit_items (
  id           uuid primary key default gen_random_uuid(),
  chit_id      uuid not null references public.bar_chits(id) on delete cascade,
  variant_id   uuid not null references public.product_variants(id) on delete restrict,
  quantity     numeric(12,2) not null default 1 check (quantity > 0),
  rate         numeric(12,2) not null check (rate >= 0),
  amount       numeric(12,2) not null check (amount >= 0)
);

create index bar_chit_items_chit_idx on public.bar_chit_items(chit_id);
create index bar_chit_items_variant_idx on public.bar_chit_items(variant_id);

-- Add audit triggers
create trigger audit_bar_chits after insert or update or delete on public.bar_chits for each row execute function app.audit_trigger();
create trigger audit_bar_chit_items after insert or update or delete on public.bar_chit_items for each row execute function app.audit_trigger();

-- Enable RLS
alter table public.bar_chits enable row level security;
alter table public.bar_chit_items enable row level security;

-- Policies for bar_chits
create policy bar_chits_select on public.bar_chits
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

create policy bar_chits_write on public.bar_chits
  for all to authenticated
  using (app.has_capability('bar.write', unit_id))
  with check (app.has_capability('bar.write', unit_id));

-- Policies for bar_chit_items
create policy bar_chit_items_select on public.bar_chit_items
  for select to authenticated
  using (exists (
    select 1 from public.bar_chits c
     where c.id = bar_chit_items.chit_id
       and (app.is_admin() or c.unit_id = app.current_unit_id())
  ));

create policy bar_chit_items_write on public.bar_chit_items
  for all to authenticated
  using (exists (
    select 1 from public.bar_chits c
     where c.id = bar_chit_items.chit_id
       and app.has_capability('bar.write', c.unit_id)
  ))
  with check (exists (
    select 1 from public.bar_chits c
     where c.id = bar_chit_items.chit_id
       and app.has_capability('bar.write', c.unit_id)
  ));
