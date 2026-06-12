-- Migration: 20260512080038_item_pack_sizes.sql
-- Add pack_size_id to items to support volume-based and packaging-based branding.

set search_path = '';

-- 1. Add column to items
alter table public.items
  add column pack_size_id uuid references public.pack_sizes(id) on delete restrict;

-- 2. Modify constraint
alter table public.items
  drop constraint if exists items_name_unique_per_unit;

-- Create unique index to handle nulls correctly (for both unit_id and pack_size_id)
create unique index items_identity_unique_idx on public.items (
  coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
  category,
  name,
  coalesce(pack_size_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- 3. Update v_items_current view to include pack size details
drop view if exists public.v_items_current;

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
  i.pack_size_id,
  v.id           as version_id,
  v.rate         as current_rate,
  v.ration_scale as current_ration_scale,
  v.valid_from   as rate_valid_from,
  v.notes        as version_notes,
  ps.label       as pack_label,
  ps.kind        as pack_kind,
  ps.volume_ml   as volume_ml,
  ps.unit_count  as unit_count
from public.items i
left join public.item_versions v
  on v.item_id = i.id and v.valid_to is null
left join public.pack_sizes ps
  on ps.id = i.pack_size_id;

comment on view public.v_items_current is
  'Items joined with currently-effective item_versions and their pack size details.';

grant select on public.v_items_current to authenticated;
