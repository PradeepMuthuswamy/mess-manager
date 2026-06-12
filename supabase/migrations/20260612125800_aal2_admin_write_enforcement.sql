-- Database-level MFA enforcement for admin-role sessions.
--
-- App-level gates (requireUser / requireApiUser) redirect or reject AAL1
-- admin sessions, but a stolen AAL1 admin JWT could otherwise write via
-- PostgREST directly with the anon key. These RESTRICTIVE policies require
-- the JWT `aal` claim to be 'aal2' for any WRITE by an admin-role account,
-- on every RLS-enabled table in public.
--
-- Reads deliberately stay available at AAL1: the MFA verify flow itself
-- needs the profile lookup and session refresh to work pre-verification.
--
-- NOTE for future migrations: tables created after this one do NOT get
-- these policies automatically — add the same three policies to any new
-- table (see the permissions checklist in AGENTS.md).

do $$
declare
  t record;
begin
  for t in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity -- only RLS-enabled tables; policies are inert otherwise
  loop
    execute format(
      'drop policy if exists aal2_admin_insert on public.%I', t.tablename);
    execute format($f$
      create policy aal2_admin_insert on public.%I
        as restrictive for insert to authenticated
        with check (
          coalesce(app.current_role()::text, '') <> 'admin'
          or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
        )
    $f$, t.tablename);

    execute format(
      'drop policy if exists aal2_admin_update on public.%I', t.tablename);
    execute format($f$
      create policy aal2_admin_update on public.%I
        as restrictive for update to authenticated
        using (
          coalesce(app.current_role()::text, '') <> 'admin'
          or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
        )
    $f$, t.tablename);

    execute format(
      'drop policy if exists aal2_admin_delete on public.%I', t.tablename);
    execute format($f$
      create policy aal2_admin_delete on public.%I
        as restrictive for delete to authenticated
        using (
          coalesce(app.current_role()::text, '') <> 'admin'
          or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
        )
    $f$, t.tablename);
  end loop;
end $$;
