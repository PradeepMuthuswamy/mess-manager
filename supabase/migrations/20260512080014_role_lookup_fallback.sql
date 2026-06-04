-- Make app.current_role() and app.current_unit_id() resolve correctly
-- even when the Custom Access Token Hook isn't enabled in the Supabase
-- Auth dashboard. Until the hook is enabled, JWT app_metadata has no
-- `role` / `unit_id` claims, so the previous implementation treated every
-- caller (including admins) as `user` and RLS blocked every write.
--
-- New behaviour:
--   1. Prefer JWT claims (fast path — what the hook populates).
--   2. Fall back to a profiles lookup using auth.uid().
--
-- The function runs SECURITY DEFINER so the fallback read isn't subject
-- to profiles RLS (which would create a cycle: RLS on profiles calls
-- current_role(), which reads profiles…). search_path is locked.

create or replace function app.current_role()
returns public.user_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_uid  uuid;
begin
  v_role := auth.jwt() -> 'app_metadata' ->> 'role';
  if v_role is not null and v_role <> '' then
    return v_role::public.user_role;
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    return 'user'::public.user_role;
  end if;

  select p.role::text into v_role
    from public.profiles p
   where p.id = v_uid;

  return coalesce(v_role, 'user')::public.user_role;
end$$;

create or replace function app.current_unit_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit_text text;
  v_unit_id   uuid;
  v_uid       uuid;
begin
  v_unit_text := auth.jwt() -> 'app_metadata' ->> 'unit_id';
  if v_unit_text is not null and v_unit_text <> '' and v_unit_text <> 'null' then
    return v_unit_text::uuid;
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    return null;
  end if;

  select p.unit_id into v_unit_id
    from public.profiles p
   where p.id = v_uid;

  return v_unit_id;
end$$;

-- Re-grant execute since CREATE OR REPLACE preserves grants on the function
-- by signature, but we want to be explicit after switching to security definer.
grant execute on function app.current_role()    to authenticated, anon;
grant execute on function app.current_unit_id() to authenticated, anon;
