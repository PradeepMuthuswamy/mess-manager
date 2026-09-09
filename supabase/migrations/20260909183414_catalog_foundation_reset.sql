-- Phase 0 — catalog foundation reset
-- Global products only + unit adoption + menu rates.
-- Approved: operational data purge so unit-scoped products can be dropped.

-- ---------------------------------------------------------------------------
-- 1. Purge operational facts that reference variants / unit-scoped products
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'mess_bill_line_items',
    'mess_bills',
    'bar_chit_items',
    'bar_chits',
    'room_bill_items',
    'room_bill_orders',
    'room_bills',
    'unit_inventory',
    'ration_stock_transactions',
    'ration_consumptions',
    'ration_scale_item_versions'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('truncate table public.%I restart identity cascade', t);
    end if;
  end loop;
end $$;

delete from public.products where unit_id is not null;

-- Views that project products.unit_id must go before the column drop.
drop view if exists public.v_masters_search;
drop view if exists public.v_items_current;

-- ---------------------------------------------------------------------------
-- 2. products: global-only identity + case-insensitive unique name
-- ---------------------------------------------------------------------------
alter table public.products drop constraint if exists products_name_unique_per_unit;

drop policy if exists products_select on public.products;
drop policy if exists products_write on public.products;
drop policy if exists product_variants_select on public.product_variants;
drop policy if exists product_variants_write on public.product_variants;

alter table public.products drop column if exists unit_id;

alter table public.products
  add column if not exists name_normalized text
  generated always as (lower(trim(name))) stored;

create unique index if not exists products_category_name_normalized_uidx
  on public.products (category_id, name_normalized);

create policy products_select on public.products
  for select to authenticated
  using (true);

create policy products_insert on public.products
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('masters.write.global', null));

create policy products_update on public.products
  for update to authenticated
  using (app.is_admin() or app.has_capability('masters.write.global', null))
  with check (app.is_admin() or app.has_capability('masters.write.global', null));

create policy products_delete on public.products
  for delete to authenticated
  using (app.is_admin() or app.has_capability('masters.write.global', null));

create policy product_variants_select on public.product_variants
  for select to authenticated
  using (true);

create policy product_variants_insert on public.product_variants
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('masters.write.global', null));

create policy product_variants_update on public.product_variants
  for update to authenticated
  using (app.is_admin() or app.has_capability('masters.write.global', null))
  with check (app.is_admin() or app.has_capability('masters.write.global', null));

create policy product_variants_delete on public.product_variants
  for delete to authenticated
  using (app.is_admin() or app.has_capability('masters.write.global', null));

-- ---------------------------------------------------------------------------
-- 3. unit_catalog — adoption (ops app writes)
-- ---------------------------------------------------------------------------
create table public.unit_catalog (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units(id) on delete restrict,
  variant_id  uuid not null references public.product_variants(id) on delete restrict,
  is_enabled  boolean not null default true,
  local_sku   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  constraint unit_catalog_unit_variant_uidx unique (unit_id, variant_id)
);

create index unit_catalog_unit_idx on public.unit_catalog (unit_id) where is_enabled;
create index unit_catalog_variant_idx on public.unit_catalog (variant_id);

create trigger unit_catalog_set_updated_at
before update on public.unit_catalog
for each row execute function app.set_updated_at();

create trigger audit_unit_catalog
after insert or update or delete on public.unit_catalog
for each row execute function app.audit_trigger();

alter table public.unit_catalog enable row level security;

create policy unit_catalog_select on public.unit_catalog
  for select to authenticated
  using (app.is_admin() or app.has_capability('masters.read', unit_id));

create policy unit_catalog_insert on public.unit_catalog
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('masters.write', unit_id));

create policy unit_catalog_update on public.unit_catalog
  for update to authenticated
  using (app.is_admin() or app.has_capability('masters.write', unit_id))
  with check (app.is_admin() or app.has_capability('masters.write', unit_id));

create policy unit_catalog_delete on public.unit_catalog
  for delete to authenticated
  using (app.is_admin() or app.has_capability('masters.write', unit_id));

-- ---------------------------------------------------------------------------
-- 4. unit_menu_rates — committee sale rate (not lot cost)
-- ---------------------------------------------------------------------------
create table public.unit_menu_rates (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete restrict,
  variant_id      uuid not null references public.product_variants(id) on delete restrict,
  rate            numeric(12,2) not null check (rate >= 0),
  effective_from  date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  constraint unit_menu_rates_unit_variant_from_uidx unique (unit_id, variant_id, effective_from)
);

create index unit_menu_rates_lookup_idx
  on public.unit_menu_rates (unit_id, variant_id, effective_from desc);

create trigger unit_menu_rates_set_updated_at
before update on public.unit_menu_rates
for each row execute function app.set_updated_at();

create trigger audit_unit_menu_rates
after insert or update or delete on public.unit_menu_rates
for each row execute function app.audit_trigger();

alter table public.unit_menu_rates enable row level security;

create policy unit_menu_rates_select on public.unit_menu_rates
  for select to authenticated
  using (app.is_admin() or app.has_capability('masters.read', unit_id));

create policy unit_menu_rates_insert on public.unit_menu_rates
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('masters.write', unit_id));

create policy unit_menu_rates_update on public.unit_menu_rates
  for update to authenticated
  using (app.is_admin() or app.has_capability('masters.write', unit_id))
  with check (app.is_admin() or app.has_capability('masters.write', unit_id));

create policy unit_menu_rates_delete on public.unit_menu_rates
  for delete to authenticated
  using (app.is_admin() or app.has_capability('masters.write', unit_id));

grant select, insert, update, delete on public.unit_catalog to authenticated;
grant select, insert, update, delete on public.unit_menu_rates to authenticated;

-- ---------------------------------------------------------------------------
-- 5. AAL2 restrictive write policies (new tables)
-- ---------------------------------------------------------------------------
create policy aal2_admin_insert on public.unit_catalog
  as restrictive for insert to authenticated
  with check (
    coalesce(app.current_role()::text, '') <> 'admin'
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );
create policy aal2_admin_update on public.unit_catalog
  as restrictive for update to authenticated
  using (
    coalesce(app.current_role()::text, '') <> 'admin'
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );
create policy aal2_admin_delete on public.unit_catalog
  as restrictive for delete to authenticated
  using (
    coalesce(app.current_role()::text, '') <> 'admin'
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );

create policy aal2_admin_insert on public.unit_menu_rates
  as restrictive for insert to authenticated
  with check (
    coalesce(app.current_role()::text, '') <> 'admin'
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );
create policy aal2_admin_update on public.unit_menu_rates
  as restrictive for update to authenticated
  using (
    coalesce(app.current_role()::text, '') <> 'admin'
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );
create policy aal2_admin_delete on public.unit_menu_rates
  as restrictive for delete to authenticated
  using (
    coalesce(app.current_role()::text, '') <> 'admin'
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );

-- ---------------------------------------------------------------------------
-- 6. Compat views — no products.unit_id; rate from latest menu price when possible
-- ---------------------------------------------------------------------------
create or replace view public.v_items_current
with (security_invoker = on)
as
select
  v.id           as id,
  null::uuid     as unit_id,
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

comment on view public.v_items_current is
  'Global catalog projection. unit_id is always null; sale rate lives on unit_menu_rates.';
grant select on public.v_items_current to authenticated;

create or replace view public.v_masters_search
with (security_invoker = on)
as
select
  v.id as variant_id,
  v.sku,
  v.is_active,
  v.unit_value,
  v.unit_type,
  v.package_type,
  v.created_at,
  v.updated_at,
  p.id as product_id,
  p.name as product_name,
  p.description as product_description,
  null::uuid as product_unit_id,
  p.fts as product_fts,
  c.id as category_id,
  c.name as category_name,
  c.parent_id as category_parent_id
from public.product_variants v
join public.products p on p.id = v.product_id
join public.categories c on c.id = p.category_id;

comment on view public.v_masters_search is
  'Global catalog listing. Filter adoption via unit_catalog, not product_unit_id.';
grant select on public.v_masters_search to authenticated;
