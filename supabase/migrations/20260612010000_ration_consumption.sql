-- Migration to support automatic/calculated Ration Consumption instead of manual daily issues.

-- 1. Drop the old daily issues table
drop table if exists public.ration_daily_issues cascade;

-- 2. Create the Ration Consumptions Table
create table public.ration_consumptions (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units(id) on delete restrict,
  consumption_date date not null,
  variant_id       uuid not null references public.product_variants(id) on delete restrict,
  quantity         numeric(14,4) not null check (quantity >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  constraint ration_consumptions_unique unique (unit_id, consumption_date, variant_id)
);

create index ration_consumptions_unit_idx on public.ration_consumptions(unit_id);
create index ration_consumptions_date_idx on public.ration_consumptions(consumption_date);

create trigger ration_consumptions_set_updated_at
before update on public.ration_consumptions
for each row execute function app.set_updated_at();

-- 3. RLS Gating
alter table public.ration_consumptions enable row level security;

create policy ration_consumptions_select on public.ration_consumptions
  for select to authenticated
  using (app.is_admin() or app.has_capability('ration.read', unit_id));

create policy ration_consumptions_insert on public.ration_consumptions
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('ration.issue', unit_id) or app.has_capability('ration.adjust', unit_id));

create policy ration_consumptions_update on public.ration_consumptions
  for update to authenticated
  using (app.is_admin() or app.has_capability('ration.issue', unit_id) or app.has_capability('ration.adjust', unit_id))
  with check (app.is_admin() or app.has_capability('ration.issue', unit_id) or app.has_capability('ration.adjust', unit_id));

create policy ration_consumptions_delete on public.ration_consumptions
  for delete to authenticated
  using (app.is_admin() or app.has_capability('ration.issue', unit_id) or app.has_capability('ration.adjust', unit_id));

-- 4. Grants
grant select, insert, update, delete on public.ration_consumptions to authenticated;

-- 5. Audit Logging Triggers
create trigger audit_ration_consumptions
after insert or update or delete on public.ration_consumptions
for each row execute function app.audit_trigger();
