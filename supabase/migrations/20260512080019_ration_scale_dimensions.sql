-- Add structured (rank_class, terrain) dimensions to ration_scales.
-- The original (20260512080018) keyed scales by (unit_id, name); this layers in
-- the photo's real-world dimensions and re-keys the unique constraint.
-- Existing rows (if any) get a sensible default of (officer, plains) before we
-- impose NOT NULL — fresh remotes will have no rows so the backfill is a no-op.

create type public.ration_terrain as enum ('plains','desert','high_altitude','field','sea');
create type public.ration_class   as enum ('officer','jco','or','civilian');

alter table public.ration_scales
  add column rank_class public.ration_class,
  add column terrain    public.ration_terrain;

update public.ration_scales
   set rank_class = coalesce(rank_class, 'officer'::public.ration_class),
       terrain    = coalesce(terrain,    'plains'::public.ration_terrain)
 where rank_class is null or terrain is null;

alter table public.ration_scales
  alter column rank_class set not null,
  alter column terrain    set not null;

alter table public.ration_scales
  drop constraint if exists ration_scales_name_unique_per_unit;

alter table public.ration_scales
  add constraint ration_scales_unique_per_unit unique (unit_id, rank_class, terrain);

create index if not exists ration_scales_dim_idx on public.ration_scales(rank_class, terrain);

-- Drop + recreate the view to surface the new columns. Postgres won't let us
-- CREATE OR REPLACE when column order/types change, so drop first.
drop view if exists public.v_ration_scale_items_current;
create view public.v_ration_scale_items_current as
select
  v.id as version_id,
  v.scale_id,
  v.item_id,
  s.unit_id,
  s.name as scale_name,
  s.rank_class,
  s.terrain,
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
