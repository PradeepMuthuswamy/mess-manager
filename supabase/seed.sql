-- Local development seed. Loaded by `supabase db reset` only.
-- The bootstrap admin is created by `npm run bootstrap-admin` (not here),
-- because Supabase Auth password hashing must go through the auth API.

-- Sample units for local dev.
insert into public.units (name, code, description) values
  ('5 Madras Regiment', '5MAD', 'Sample unit for local development'),
  ('1 Sikh Regiment',   '1SIKH', 'Sample unit for local development')
on conflict (code) do nothing;

-- Sample global ration items (admin-owned, no unit).
with rice as (
  insert into public.items (unit_id, category, name, uom)
  values (null, 'ration', 'Rice', 'kg')
  on conflict (unit_id, category, name) do nothing
  returning id
),
dal as (
  insert into public.items (unit_id, category, name, uom)
  values (null, 'ration', 'Dal (Toor)', 'kg')
  on conflict (unit_id, category, name) do nothing
  returning id
),
sugar as (
  insert into public.items (unit_id, category, name, uom)
  values (null, 'ration', 'Sugar', 'kg')
  on conflict (unit_id, category, name) do nothing
  returning id
)
insert into public.item_versions (item_id, rate, ration_scale, notes, valid_from)
select id, 42.00, 0.150, 'Initial seed', now() from rice
union all
select id, 110.00, 0.090, 'Initial seed', now() from dal
union all
select id, 48.00, 0.025, 'Initial seed', now() from sugar;

-- Capability templates are seeded inside migration 0005, no need to repeat here.
