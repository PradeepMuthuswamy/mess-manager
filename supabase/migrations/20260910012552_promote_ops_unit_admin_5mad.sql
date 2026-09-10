-- Pin the bootstrap operator to a unit so they can sign in to this ops app.
-- super_admin is rejected at sign-in (Admin Console only).
set local session_replication_role = replica;

update public.profiles
set role = 'unit_admin',
    unit_id = (select id from public.units where code = '5MAD'),
    updated_at = now()
where email = 'pradeep@commandhq.in';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'unit_admin'),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'unit_admin'),
    updated_at = now()
where email = 'pradeep@commandhq.in';
