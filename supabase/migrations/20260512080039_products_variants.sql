-- Create enums unit_type and package_type
create type public.unit_type as enum ('ML', 'LITRE', 'GRAM', 'KG', 'PIECE');
create type public.package_type as enum ('BOTTLE', 'CAN', 'PACKET', 'BOX', 'LOOSE');

-- Create categories table
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_id   uuid references public.categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Categories triggers and RLS
create trigger categories_set_updated_at
before update on public.categories
for each row execute function app.set_updated_at();

alter table public.categories enable row level security;

create policy categories_select on public.categories
  for select to authenticated using (true);

create policy categories_write on public.categories
  for all to authenticated
  using (app.is_admin() or app.has_capability('masters.write.global', null))
  with check (app.is_admin() or app.has_capability('masters.write.global', null));

create trigger audit_categories
after insert or update or delete on public.categories
for each row execute function app.audit_trigger();

-- Seed default categories
insert into public.categories (id, name, parent_id) values
  ('00000000-0000-0000-0000-000000000001', 'Alcohol', null),
  ('00000000-0000-0000-0000-000000000002', 'Cold Drinks', null),
  ('00000000-0000-0000-0000-000000000003', 'Cigars', null),
  ('00000000-0000-0000-0000-000000000004', 'Snacks', null),
  ('00000000-0000-0000-0000-000000000005', 'Ration', null),
  ('00000000-0000-0000-0000-000000000006', 'Grocery', null);

insert into public.categories (id, name, parent_id) values
  ('00000000-0000-0000-0000-000000000011', 'Beer', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000012', 'Rum', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000013', 'Whisky', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000014', 'Gin', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000015', 'Brandy', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000041', 'Chips', '00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000042', 'Peanuts', '00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000043', 'Biscuits', '00000000-0000-0000-0000-000000000004');

-- Create products table
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid references public.units(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  constraint products_name_unique_per_unit unique (unit_id, category_id, name)
);

-- Products triggers and RLS
create trigger products_set_updated_at
before update on public.products
for each row execute function app.set_updated_at();

alter table public.products enable row level security;

create policy products_select on public.products
  for select to authenticated
  using (
    app.is_admin()
    or unit_id is null
    or unit_id = app.current_unit_id()
  );

create policy products_write on public.products
  for all to authenticated
  using (
    app.is_admin()
    or case
         when unit_id is null then app.has_capability('masters.write.global', null)
         else app.has_capability('masters.write', unit_id)
       end
  )
  with check (
    app.is_admin()
    or case
         when unit_id is null then app.has_capability('masters.write.global', null)
         else app.has_capability('masters.write', unit_id)
       end
  );

create trigger audit_products
after insert or update or delete on public.products
for each row execute function app.audit_trigger();

-- Create product_variants table
create table public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  unit_value    numeric(12,3) not null,
  unit_type     public.unit_type not null,
  package_type  public.package_type not null,
  sku           text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  constraint variants_unique_identity unique (product_id, unit_value, unit_type, package_type)
);

-- Product variants triggers and RLS
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function app.set_updated_at();

alter table public.product_variants enable row level security;

create policy product_variants_select on public.product_variants
  for select to authenticated
  using (exists (
    select 1 from public.products p
     where p.id = product_variants.product_id
       and (app.is_admin() or p.unit_id is null or p.unit_id = app.current_unit_id())
  ));

create policy product_variants_write on public.product_variants
  for all to authenticated
  using (exists (
    select 1 from public.products p
     where p.id = product_variants.product_id
       and (
         app.is_admin()
         or (p.unit_id is null and app.has_capability('masters.write.global', null))
         or (p.unit_id is not null and app.has_capability('masters.write', p.unit_id))
       )
  ))
  with check (exists (
    select 1 from public.products p
     where p.id = product_variants.product_id
       and (
         app.is_admin()
         or (p.unit_id is null and app.has_capability('masters.write.global', null))
         or (p.unit_id is not null and app.has_capability('masters.write', p.unit_id))
       )
  ));

create trigger audit_product_variants
after insert or update or delete on public.product_variants
for each row execute function app.audit_trigger();

-- Migrate old items data to products and product_variants (if items exists)
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'items') then
    insert into public.products (id, unit_id, category_id, name, description, is_active, created_at, updated_at, created_by, updated_by)
    select
      id,
      unit_id,
      case category
        when 'alcohol' then '00000000-0000-0000-0000-000000000001'::uuid
        when 'soft_drink' then '00000000-0000-0000-0000-000000000002'::uuid
        when 'cigar' then '00000000-0000-0000-0000-000000000003'::uuid
        when 'ration' then '00000000-0000-0000-0000-000000000005'::uuid
        else '00000000-0000-0000-0000-000000000006'::uuid
      end as category_id,
      name,
      null as description,
      is_active,
      created_at,
      updated_at,
      created_by,
      updated_by
    from public.items;

    insert into public.product_variants (product_id, unit_value, unit_type, package_type, sku, is_active, created_at, updated_at, created_by, updated_by)
    select
      id as product_id,
      1.000 as unit_value,
      case uom
        when 'kg' then 'KG'::public.unit_type
        when 'g' then 'GRAM'::public.unit_type
        when 'l' then 'LITRE'::public.unit_type
        when 'ml' then 'ML'::public.unit_type
        else 'PIECE'::public.unit_type
      end as unit_type,
      case uom
        when 'bottle' then 'BOTTLE'::public.package_type
        when 'pack' then 'PACKET'::public.package_type
        else 'LOOSE'::public.package_type
      end as package_type,
      sku,
      is_active,
      created_at,
      updated_at,
      created_by,
      updated_by
    from public.items;
  end if;
end$$;

-- Drop old views before altering references
drop view if exists public.v_items_current cascade;
drop view if exists public.v_unit_inventory_current cascade;
drop view if exists public.v_ration_scale_items_current cascade;

-- Modify unit_inventory
alter table public.unit_inventory drop constraint if exists unit_inventory_item_id_fkey;
alter table public.unit_inventory drop constraint if exists unit_inventory_pack_size_id_fkey;
alter table public.unit_inventory rename column item_id to variant_id;
alter table public.unit_inventory drop column if exists pack_size_id;

-- Update unit_inventory to point to variants
do $$
begin
  if exists (select 1 from public.product_variants) then
    update public.unit_inventory ui
       set variant_id = (select id from public.product_variants pv where pv.product_id = ui.variant_id);
  end if;
end$$;

alter table public.unit_inventory
  add constraint unit_inventory_variant_id_fkey
  foreign key (variant_id) references public.product_variants(id) on delete restrict;

drop index if exists public.unit_inventory_unit_item_idx;
create index unit_inventory_unit_variant_idx on public.unit_inventory (unit_id, variant_id);

-- Modify ration_scale_item_versions
alter table public.ration_scale_item_versions drop constraint if exists ration_scale_item_versions_item_id_fkey;
alter table public.ration_scale_item_versions rename column item_id to variant_id;

-- Update ration_scale_item_versions to point to variants
do $$
begin
  if exists (select 1 from public.product_variants) then
    update public.ration_scale_item_versions rs
       set variant_id = (select id from public.product_variants pv where pv.product_id = rs.variant_id);
  end if;
end$$;

alter table public.ration_scale_item_versions
  add constraint ration_scale_item_versions_variant_id_fkey
  foreign key (variant_id) references public.product_variants(id) on delete restrict;

drop index if exists public.rsiv_one_open_per_scale_item;
drop index if exists public.rsiv_scale_item_time_idx;
create unique index rsiv_one_open_per_scale_variant
  on public.ration_scale_item_versions(scale_id, variant_id) where valid_to is null;
create index rsiv_scale_variant_time_idx
  on public.ration_scale_item_versions(scale_id, variant_id, valid_from desc);

-- Recreate set_ration_scale_item function
drop function if exists public.set_ration_scale_item(uuid, uuid, numeric, public.uom, text, timestamptz) cascade;

create or replace function public.set_ration_scale_item(
  p_scale_id uuid,
  p_variant_id uuid,
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
   where scale_id = p_scale_id and variant_id = p_variant_id and valid_to is null;

  if found and v_existing.auth_qty = p_auth_qty and v_existing.uom = p_uom
     and v_existing.notes = coalesce(p_notes,'') then
    return v_existing.id;
  end if;

  update public.ration_scale_item_versions
     set valid_to = p_effective_at
   where scale_id = p_scale_id and variant_id = p_variant_id and valid_to is null;

  insert into public.ration_scale_item_versions(scale_id, variant_id, auth_qty, uom, notes, valid_from, created_by)
  values (p_scale_id, p_variant_id, p_auth_qty, p_uom, p_notes, p_effective_at, auth.uid())
  returning id into v_new_id;

  return v_new_id;
end$$;

grant execute on function public.set_ration_scale_item(uuid, uuid, numeric, public.uom, text, timestamptz) to authenticated;

-- Modify room_bill_items
alter table public.room_bill_items drop constraint if exists room_bill_items_item_id_fkey;
alter table public.room_bill_items rename column item_id to variant_id;

-- Update room_bill_items to point to variants
do $$
begin
  if exists (select 1 from public.product_variants) then
    update public.room_bill_items rb
       set variant_id = (select id from public.product_variants pv where pv.product_id = rb.variant_id);
  end if;
end$$;

alter table public.room_bill_items
  add constraint room_bill_items_variant_id_fkey
  foreign key (variant_id) references public.product_variants(id) on delete set null;

-- Drop function set_item_rate and old tables
drop function if exists public.set_item_rate(uuid, numeric, numeric, text, timestamptz) cascade;
drop table if exists public.item_versions cascade;
drop table if exists public.pack_sizes cascade;
drop table if exists public.items cascade;

-- Recreate views
create or replace view public.v_items_current
with (security_invoker = on)
as
select
  v.id           as id,
  p.unit_id      as unit_id,
  case coalesce(c_parent.name, c.name)
    when 'Alcohol' then 'alcohol'::public.item_category
    when 'Cold Drinks' then 'soft_drink'::public.item_category
    when 'Cigars' then 'cigar'::public.item_category
    when 'Snacks' then 'grocery'::public.item_category
    when 'Ration' then 'ration'::public.item_category
    when 'Grocery' then 'grocery'::public.item_category
    else 'grocery'::public.item_category
  end            as category,
  p.name         as name,
  v.sku          as sku,
  case v.unit_type
    when 'ML' then 'ml'::public.uom
    when 'LITRE' then 'l'::public.uom
    when 'GRAM' then 'g'::public.uom
    when 'KG' then 'kg'::public.uom
    when 'PIECE' then 'piece'::public.uom
  end::public.uom as uom,
  v.is_active    as is_active,
  v.created_at   as created_at,
  v.updated_at   as updated_at,
  v.created_by   as created_by,
  v.updated_by   as updated_by,
  null::uuid     as pack_size_id,
  v.id           as version_id,
  0.00::numeric(12,2) as current_rate,
  null::numeric(14,3) as current_ration_scale,
  v.created_at   as rate_valid_from,
  null::text      as version_notes,
  (v.unit_value::text || ' ' || v.unit_type || ' ' || v.package_type) as pack_label,
  case when v.unit_type in ('ML', 'LITRE') then 'volume'::text else 'count'::text end as pack_kind,
  case when v.unit_type = 'ML' then v.unit_value when v.unit_type = 'LITRE' then v.unit_value * 1000 else null end::numeric(12,3) as volume_ml,
  case when v.unit_type = 'PIECE' then v.unit_value::int else null end as unit_count
from public.product_variants v
join public.products p on p.id = v.product_id
join public.categories c on c.id = p.category_id
left join public.categories c_parent on c_parent.id = c.parent_id;

comment on view public.v_items_current is 'Items/variants view preserving compatibility footprint.';
grant select on public.v_items_current to authenticated;

create or replace view public.v_unit_inventory_current
with (security_invoker = on)
as
select
  ui.id,
  ui.unit_id,
  ui.variant_id as item_id,
  null::uuid as pack_size_id,
  ui.qty_packs,
  ui.rate,
  ui.acquired_on,
  ui.source,
  ui.is_active,
  ui.created_at,
  ui.updated_at,
  ui.created_by,
  ui.updated_by,
  p.name        as item_name,
  case coalesce(c_parent.name, c.name)
    when 'Alcohol' then 'alcohol'::public.item_category
    when 'Cold Drinks' then 'soft_drink'::public.item_category
    when 'Cigars' then 'cigar'::public.item_category
    when 'Snacks' then 'grocery'::public.item_category
    when 'Ration' then 'ration'::public.item_category
    when 'Grocery' then 'grocery'::public.item_category
    else 'grocery'::public.item_category
  end            as category,
  case v.unit_type
    when 'ML' then 'ml'::public.uom
    when 'LITRE' then 'l'::public.uom
    when 'GRAM' then 'g'::public.uom
    when 'KG' then 'kg'::public.uom
    when 'PIECE' then 'piece'::public.uom
  end::public.uom as uom,
  (v.unit_value::text || ' ' || v.unit_type || ' ' || v.package_type) as pack_label,
  case when v.unit_type in ('ML', 'LITRE') then 'volume'::text else 'count'::text end as kind,
  case when v.unit_type = 'ML' then v.unit_value when v.unit_type = 'LITRE' then v.unit_value * 1000 else null end::numeric(12,3) as volume_ml,
  case when v.unit_type = 'PIECE' then v.unit_value::int else null end as unit_count
from public.unit_inventory ui
join public.product_variants v on v.id = ui.variant_id
join public.products p        on p.id = v.product_id
join public.categories c      on c.id = p.category_id
left join public.categories c_parent on c_parent.id = c.parent_id;

comment on view public.v_unit_inventory_current is 'Inventory lots view preserving compatibility footprint.';
grant select on public.v_unit_inventory_current to authenticated;

create or replace view public.v_ration_scale_items_current as
select
  v.id as version_id,
  v.scale_id,
  v.variant_id as item_id,
  s.unit_id,
  s.name as scale_name,
  s.rank_class,
  s.terrain,
  s.is_active as scale_active,
  case coalesce(c_parent.name, c.name)
    when 'Alcohol' then 'alcohol'::public.item_category
    when 'Cold Drinks' then 'soft_drink'::public.item_category
    when 'Cigars' then 'cigar'::public.item_category
    when 'Snacks' then 'grocery'::public.item_category
    when 'Ration' then 'ration'::public.item_category
    when 'Grocery' then 'grocery'::public.item_category
    else 'grocery'::public.item_category
  end            as category,
  p.name as item_name,
  pv.sku,
  v.auth_qty,
  v.uom,
  v.notes,
  v.valid_from,
  v.created_by
from public.ration_scale_item_versions v
join public.ration_scales s on s.id = v.scale_id
join public.product_variants pv on pv.id = v.variant_id
join public.products p on p.id = pv.product_id
join public.categories c on c.id = p.category_id
left join public.categories c_parent on c_parent.id = c.parent_id
where v.valid_to is null;

grant select on public.v_ration_scale_items_current to authenticated;
