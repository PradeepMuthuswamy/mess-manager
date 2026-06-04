-- Invites failed with "Database error saving new user": handle_new_user
-- inserted a profile with role='user' and unit_id=null, violating the
-- profiles_unit_required check (role='admin' OR unit_id IS NOT NULL).
--
-- Every invite path (member, dependant, API) knows the unit, so the trigger
-- is just a metadata reader: take role + unit_id from raw_user_meta_data,
-- default role 'user'. This supersedes the dependant_id lookup added in
-- 20260512080017 — callers now pass unit_id directly.

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_unit uuid;
  v_role public.user_role;
begin
  v_role := coalesce(
    nullif(new.raw_user_meta_data->>'role', '')::public.user_role,
    'user'
  );
  begin
    v_unit := nullif(new.raw_user_meta_data->>'unit_id', '')::uuid;
  exception when others then
    v_unit := null;
  end;

  insert into public.profiles (id, email, full_name, role, unit_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    v_unit
  );
  return new;
end$$;
