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
  insert into public.products (unit_id, category_id, name)
  values (null, '00000000-0000-0000-0000-000000000005'::uuid, 'Rice')
  on conflict (unit_id, category_id, name) do nothing
  returning id
),
dal as (
  insert into public.products (unit_id, category_id, name)
  values (null, '00000000-0000-0000-0000-000000000005'::uuid, 'Dal (Toor)')
  on conflict (unit_id, category_id, name) do nothing
  returning id
),
sugar as (
  insert into public.products (unit_id, category_id, name)
  values (null, '00000000-0000-0000-0000-000000000005'::uuid, 'Sugar')
  on conflict (unit_id, category_id, name) do nothing
  returning id
)
insert into public.product_variants (product_id, unit_value, unit_type, package_type)
select id, 1.000, 'KG'::public.unit_type, 'LOOSE'::public.package_type from rice
union all
select id, 1.000, 'KG'::public.unit_type, 'LOOSE'::public.package_type from dal
union all
select id, 1.000, 'KG'::public.unit_type, 'LOOSE'::public.package_type from sugar
on conflict (product_id, unit_value, unit_type, package_type) do nothing;
