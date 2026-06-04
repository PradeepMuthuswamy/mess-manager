create table public.items (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid references public.units(id) on delete restrict, -- null = global catalog
  category    public.item_category not null,
  name        text not null,
  sku         citext,
  uom         public.uom not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  constraint items_name_unique_per_unit unique (unit_id, category, name)
);
create index items_category_idx on public.items(category);
create index items_unit_idx on public.items(unit_id);
create index items_active_idx on public.items(is_active);

create trigger items_set_updated_at
before update on public.items
for each row execute function app.set_updated_at();

create table public.item_versions (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items(id) on delete cascade,
  rate         numeric(12,2) not null check (rate >= 0),
  ration_scale numeric(14,3),
  notes        text,
  valid_from   timestamptz not null default now(),
  valid_to     timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  constraint item_versions_range_check check (valid_to is null or valid_to > valid_from)
);
create unique index item_versions_one_open_per_item
  on public.item_versions(item_id) where valid_to is null;
create index item_versions_item_time_idx
  on public.item_versions(item_id, valid_from desc);

create or replace function public.set_item_rate(
  p_item_id uuid,
  p_rate numeric,
  p_ration_scale numeric default null,
  p_notes text default null,
  p_effective_at timestamptz default now()
) returns uuid
language plpgsql security invoker as $$
declare
  v_new_id uuid;
begin
  update public.item_versions
     set valid_to = p_effective_at
   where item_id = p_item_id and valid_to is null;

  insert into public.item_versions(item_id, rate, ration_scale, notes, valid_from, created_by)
  values (p_item_id, p_rate, p_ration_scale, p_notes, p_effective_at, auth.uid())
  returning id into v_new_id;

  return v_new_id;
end$$;

grant execute on function public.set_item_rate(uuid, numeric, numeric, text, timestamptz) to authenticated;
