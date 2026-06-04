-- Per-unit terrain (plains/desert/high_altitude/field/sea). Drives ration
-- scale resolution in later phases and lets the admin tune efficiency per
-- unit. Reuses the existing public.ration_terrain enum. units already has
-- RLS (UPDATE = admin) and an audit_units trigger that captures this column.

alter table public.units add column terrain public.ration_terrain;

comment on column public.units.terrain is
  'Geographical terrain of the unit; drives ration scale resolution. Nullable until set by an admin.';
