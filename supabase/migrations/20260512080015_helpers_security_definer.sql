-- Defense-in-depth: convert the remaining RLS helper functions to
-- SECURITY DEFINER with a locked search_path. Migration 0014 already
-- did this for current_role() / current_unit_id(); doing the same for
-- is_unit_admin_of() and has_capability() removes any chance of a
-- silent RLS recursion when new policies or new modules join the chain.
--
-- Also fixes app.guard_profile_role_change(): previously it read the
-- caller's role straight from JWT app_metadata, which meant role/unit
-- changes via SSR (server-action) were blocked for admins whenever the
-- Custom Access Token Hook wasn't enabled. Switching it to
-- app.current_role() picks up the profile-table fallback added in 0014.

create or replace function app.is_unit_admin_of(p_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.current_role() = 'unit_admin'
     and app.current_unit_id() = p_unit
$$;

create or replace function app.has_capability(
  p_cap public.capability,
  p_unit uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.current_role() = 'admin' then true
    when app.current_role() = 'unit_admin'
      and (p_unit is null or p_unit = app.current_unit_id()) then true
    else exists (
      select 1
        from public.user_capabilities uc
       where uc.user_id = (select auth.uid())
         and uc.capability = p_cap
         and (uc.unit_id is null or uc.unit_id = p_unit)
    )
  end
$$;

grant execute on function app.is_unit_admin_of(uuid)
  to authenticated, anon;
grant execute on function app.has_capability(public.capability, uuid)
  to authenticated, anon;

-- Use the role fallback in the trigger that gates role/unit changes
-- on profiles, so admins can mutate roles even before the access-token
-- hook is enabled on Supabase Cloud.
create or replace function app.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt_role text;
  v_app_role text;
begin
  v_jwt_role := coalesce(auth.role(), '');
  if v_jwt_role = 'service_role' then
    return new;
  end if;

  v_app_role := app.current_role()::text;

  if (new.role is distinct from old.role)
     or (new.unit_id is distinct from old.unit_id) then
    if v_app_role <> 'admin' then
      raise exception 'Only admin may change role or unit_id'
        using errcode = '42501';
    end if;
  end if;
  return new;
end$$;
