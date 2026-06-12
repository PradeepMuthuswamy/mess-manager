-- Bridge for the admin console's "Auth security events" view.
-- `auth.audit_log_entries` (GoTrue's own audit log: logins, MFA factor
-- enroll/unenroll, password recovery, ...) lives in the `auth` schema,
-- which PostgREST never exposes — even to the service role. This
-- SECURITY DEFINER function is the supported bridge.
--
-- Security: SECURITY DEFINER in `public` is callable by any authenticated
-- user by default, so the function self-gates on app.is_admin() and
-- EXECUTE is revoked from anon/public.
drop function if exists public.recent_auth_events(int);
create or replace function public.recent_auth_events(p_limit int default 50)
returns table (id uuid, payload json, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select a.id, a.payload, a.created_at
    from auth.audit_log_entries a
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke all on function public.recent_auth_events(int) from public, anon;
grant execute on function public.recent_auth_events(int) to authenticated;
