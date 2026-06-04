-- Inventory model fix — typed pack sizes; servings derived, not typed.
--
-- pack_sizes becomes classified master data: a `kind` ('volume' | 'count')
-- plus normalized facets (volume_ml for bottles/cans, unit_count for boxes).
-- This lets the per-category dropdown show only sensible options and lets
-- servings be a pure function of (category standard + pack master) instead
-- of asking the user to type units_per_pack / unit_label on each lot.
--
-- unit_inventory loses units_per_pack / unit_label (empty table in prod —
-- verified — so the column drops carry no data migration).
--
-- RLS, audit triggers and the set_updated_at trigger on both tables are
-- intentionally left untouched (no table drop/recreate).

set search_path = '';

-- pack_sizes: new typed columns -------------------------------------------
alter table public.pack_sizes
  add column kind text not null default 'volume'
    check (kind in ('volume', 'count'));

alter table public.pack_sizes
  add column volume_ml numeric(12,3)
    check (volume_ml is null or volume_ml > 0);

alter table public.pack_sizes
  add column unit_count int
    check (unit_count is null or unit_count > 0);

-- Backfill the 8 existing seed rows by label (explicit, not uom math). ------
update public.pack_sizes set kind = 'volume', volume_ml = 180,  unit_count = null where label = '180 ml';
update public.pack_sizes set kind = 'volume', volume_ml = 375,  unit_count = null where label = '375 ml';
update public.pack_sizes set kind = 'volume', volume_ml = 750,  unit_count = null where label = '750 ml';
update public.pack_sizes set kind = 'volume', volume_ml = 1000, unit_count = null where label = '1 L';
update public.pack_sizes set kind = 'volume', volume_ml = 2000, unit_count = null where label = '2 L';
update public.pack_sizes set kind = 'count',  volume_ml = null,  unit_count = 10  where label = 'Box of 10';
update public.pack_sizes set kind = 'count',  volume_ml = null,  unit_count = 20  where label = 'Box of 20';
update public.pack_sizes set kind = 'count',  volume_ml = null,  unit_count = 25  where label = 'Box of 25';

-- Integrity: facet must match kind. Applied AFTER backfill so existing
-- rows already satisfy it.
alter table public.pack_sizes
  add constraint pack_sizes_kind_facet check (
    (kind = 'volume' and volume_ml is not null and unit_count is null)
    or
    (kind = 'count'  and unit_count is not null and volume_ml is null)
  );

-- The current view references the columns being dropped. Drop it first,
-- then recreate it (further down) on the new shape. CASCADE is not used —
-- the view is the only dependent and it is rebuilt explicitly below.
drop view if exists public.v_unit_inventory_current;

-- Drop the superseded loose volume columns (only seed rows existed; the
-- view and code referencing them are updated in this migration / wave).
alter table public.pack_sizes drop column volume_value;
alter table public.pack_sizes drop column volume_uom;

-- Extend the controlled vocabulary with PET / can variants (idempotent).
insert into public.pack_sizes (label, kind, volume_ml, unit_count, sort_order) values
  ('250 ml can',   'volume', 250,  null, 15),
  ('500 ml (PET)', 'volume', 500,  null, 25),
  ('750 ml (PET)', 'volume', 750,  null, 35),
  ('1 L (PET)',    'volume', 1000, null, 45),
  ('2 L (PET)',    'volume', 2000, null, 55)
on conflict (label) do nothing;

-- unit_inventory: drop user-typed derivable columns (empty table) ----------
alter table public.unit_inventory drop column units_per_pack;
alter table public.unit_inventory drop column unit_label;

-- View: rebuilt on the latest (…080030) definition, swapping the dropped
-- columns for the new typed pack facets. security_invoker preserved.
-- (Dropped above so the column-set change is unambiguous.)
create view public.v_unit_inventory_current
with (security_invoker = on)
as
select
  ui.id,
  ui.unit_id,
  ui.item_id,
  ui.pack_size_id,
  ui.qty_packs,
  ui.rate,
  ui.acquired_on,
  ui.source,
  ui.is_active,
  ui.created_at,
  ui.updated_at,
  ui.created_by,
  ui.updated_by,
  i.name        as item_name,
  i.category    as category,
  i.uom         as uom,
  ps.label      as pack_label,
  ps.kind       as kind,
  ps.volume_ml  as volume_ml,
  ps.unit_count as unit_count
from public.unit_inventory ui
join public.items i       on i.id = ui.item_id
join public.pack_sizes ps on ps.id = ui.pack_size_id;

comment on view public.v_unit_inventory_current is
  'Per-unit inventory lots joined with master item (name/category/uom) and pack_sizes (label/kind/volume_ml/unit_count). Read-side; serving/value math lives in TS.';

grant select on public.v_unit_inventory_current to authenticated;
