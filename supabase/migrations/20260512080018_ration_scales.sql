-- Ration scales: per-unit authorisation templates (e.g. "Officers", "JCOs/OR").
-- Each scale lists items + per-day per-person authorised quantities, version-controlled (SCD-2).
-- Mirrors the items / item_versions / set_item_rate pattern from 20260512080004_items.sql.
-- NOTE: this is the original shape. Rank_class and terrain columns are added by
-- 20260512080019_ration_scale_dimensions.sql.

create table public.ration_scales (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete restrict,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  constraint ration_scales_name_unique_per_unit unique (unit_id, name)
);
create index ration_scales_unit_idx on public.ration_scales(unit_id);

create trigger ration_scales_set_updated_at
before update on public.ration_scales
for each row execute function app.set_updated_at();

create table public.ration_scale_item_versions (
  id           uuid primary key default gen_random_uuid(),
  scale_id     uuid not null references public.ration_scales(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete restrict,
  auth_qty     numeric(14,4) not null check (auth_qty >= 0),
  uom          public.uom not null,
  notes        text,
  valid_from   timestamptz not null default now(),
  valid_to     timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  constraint rsiv_range_check check (valid_to is null or valid_to > valid_from)
);
create unique index rsiv_one_open_per_scale_item
  on public.ration_scale_item_versions(scale_id, item_id) where valid_to is null;
create index rsiv_scale_item_time_idx
  on public.ration_scale_item_versions(scale_id, item_id, valid_from desc);

create or replace function public.set_ration_scale_item(
  p_scale_id uuid,
  p_item_id uuid,
  p_auth_qty numeric,
  p_uom public.uom,
  p_notes text default null,
  p_effective_at timestamptz default now()
) returns uuid
language plpgsql security invoker as $$
declare
  v_existing record;
  v_new_id uuid;
begin
  select id, auth_qty, uom, coalesce(notes,'') as notes
    into v_existing
    from public.ration_scale_item_versions
   where scale_id = p_scale_id and item_id = p_item_id and valid_to is null;

  if found and v_existing.auth_qty = p_auth_qty and v_existing.uom = p_uom
     and v_existing.notes = coalesce(p_notes,'') then
    return v_existing.id;
  end if;

  update public.ration_scale_item_versions
     set valid_to = p_effective_at
   where scale_id = p_scale_id and item_id = p_item_id and valid_to is null;

  insert into public.ration_scale_item_versions(scale_id, item_id, auth_qty, uom, notes, valid_from, created_by)
  values (p_scale_id, p_item_id, p_auth_qty, p_uom, p_notes, p_effective_at, auth.uid())
  returning id into v_new_id;

  return v_new_id;
end$$;

grant execute on function public.set_ration_scale_item(uuid, uuid, numeric, public.uom, text, timestamptz) to authenticated;

create or replace view public.v_ration_scale_items_current as
select
  v.id as version_id,
  v.scale_id,
  v.item_id,
  s.unit_id,
  s.name as scale_name,
  s.is_active as scale_active,
  i.category,
  i.name as item_name,
  i.sku,
  v.auth_qty,
  v.uom,
  v.notes,
  v.valid_from,
  v.created_by
from public.ration_scale_item_versions v
join public.ration_scales s on s.id = v.scale_id
join public.items i on i.id = v.item_id
where v.valid_to is null;

grant select on public.v_ration_scale_items_current to authenticated;

alter table public.ration_scales enable row level security;
alter table public.ration_scale_item_versions enable row level security;

create policy ration_scales_select on public.ration_scales
  for select to authenticated
  using (
    app.is_admin()
    or app.has_capability('ration.read', unit_id)
    or app.has_capability('masters.read', unit_id)
  );

create policy ration_scales_insert on public.ration_scales
  for insert to authenticated
  with check (
    app.is_admin() or app.has_capability('ration.adjust', unit_id)
  );

create policy ration_scales_update on public.ration_scales
  for update to authenticated
  using (
    app.is_admin() or app.has_capability('ration.adjust', unit_id)
  )
  with check (
    app.is_admin() or app.has_capability('ration.adjust', unit_id)
  );

create policy ration_scales_delete on public.ration_scales
  for delete to authenticated
  using (app.is_admin());

create policy rsiv_select on public.ration_scale_item_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.ration_scales s
      where s.id = ration_scale_item_versions.scale_id
        and (
          app.is_admin()
          or app.has_capability('ration.read', s.unit_id)
          or app.has_capability('masters.read', s.unit_id)
        )
    )
  );

create policy rsiv_insert on public.ration_scale_item_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ration_scales s
      where s.id = ration_scale_item_versions.scale_id
        and (app.is_admin() or app.has_capability('ration.adjust', s.unit_id))
    )
  );

create policy rsiv_update on public.ration_scale_item_versions
  for update to authenticated
  using (
    exists (
      select 1 from public.ration_scales s
      where s.id = ration_scale_item_versions.scale_id
        and (app.is_admin() or app.has_capability('ration.adjust', s.unit_id))
    )
  )
  with check (
    exists (
      select 1 from public.ration_scales s
      where s.id = ration_scale_item_versions.scale_id
        and (app.is_admin() or app.has_capability('ration.adjust', s.unit_id))
    )
  );

create policy rsiv_delete on public.ration_scale_item_versions
  for delete to authenticated
  using (app.is_admin());

create trigger audit_ration_scales                after insert or update or delete on public.ration_scales                for each row execute function app.audit_trigger();
create trigger audit_ration_scale_item_versions   after insert or update or delete on public.ration_scale_item_versions   for each row execute function app.audit_trigger();
