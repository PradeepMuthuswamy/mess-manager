-- Items joined with the currently-effective version. Inherits RLS of base tables.
create or replace view public.v_items_current
with (security_invoker = on)
as
select
  i.id,
  i.unit_id,
  i.category,
  i.name,
  i.sku,
  i.uom,
  i.is_active,
  i.created_at,
  i.updated_at,
  i.created_by,
  i.updated_by,
  v.id           as version_id,
  v.rate         as current_rate,
  v.ration_scale as current_ration_scale,
  v.valid_from   as rate_valid_from,
  v.notes        as version_notes
from public.items i
left join public.item_versions v
  on v.item_id = i.id and v.valid_to is null;

comment on view public.v_items_current is
  'Items joined with the currently-effective item_versions row. Use this for read-side queries that need the current rate.';

grant select on public.v_items_current to authenticated;
