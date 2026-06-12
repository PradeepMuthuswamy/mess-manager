-- Create v_masters_search view for optimized master list search, sort, and pagination
drop view if exists public.v_masters_search cascade;

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
  p.unit_id as product_unit_id,
  p.fts as product_fts,
  c.id as category_id,
  c.name as category_name,
  c.parent_id as category_parent_id
from public.product_variants v
join public.products p on p.id = v.product_id
join public.categories c on c.id = p.category_id;

comment on view public.v_masters_search is
  'View for optimized master catalog listing, search, sort, and pagination.';

grant select on public.v_masters_search to authenticated;
