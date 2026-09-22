-- Evaluate auth and role helpers once per query, and index uncovered
-- foreign keys.
--
-- PostgREST re-runs a policy expression for every row unless a zero-argument
-- helper is forced into an initplan with (select helper()). The checks stay
-- the same. Only auth.uid(), auth.jwt(), app.current_role(),
-- app.current_unit_id(), and app.is_admin() are wrapped. Helpers that take
-- a row column (app.has_capability, app.is_unit_admin_of) stay as they are.
--
-- Foreign-key indexes cover the referencing columns Postgres scans on
-- delete and on joins. Tables are small today; the indexes are for when
-- they are not.

create or replace function app.wrap_rls_initplan(expr text)
returns text
language plpgsql
immutable
as $$
declare
  s text := expr;
begin
  if s is null then
    return null;
  end if;

  s := replace(s, '(select auth.jwt())', '___JWT___');
  s := replace(s, '( SELECT auth.uid() AS uid)', '___UID___');
  s := replace(s, '(select auth.uid())', '___UID___');
  s := replace(s, '(select app.current_role())', '___ROLE___');
  s := replace(s, '(select app.current_unit_id())', '___UNIT___');
  s := replace(s, '(select app.is_admin())', '___ADMIN___');

  s := replace(s, 'auth.jwt()', '___JWT___');
  s := replace(s, 'auth.uid()', '___UID___');
  s := replace(s, 'app."current_role"()', '___ROLE___');
  s := replace(s, 'app.current_role()', '___ROLE___');
  s := replace(s, 'app.current_unit_id()', '___UNIT___');
  s := replace(s, 'app.is_admin()', '___ADMIN___');

  s := replace(s, '___JWT___', '(select auth.jwt())');
  s := replace(s, '___UID___', '(select auth.uid())');
  s := replace(s, '___ROLE___', '(select app.current_role())');
  s := replace(s, '___UNIT___', '(select app.current_unit_id())');
  s := replace(s, '___ADMIN___', '(select app.is_admin())');
  return s;
end $$;

do $$
declare
  r record;
  new_using text;
  new_check text;
  cmd text;
  kind text;
  role_list text;
  ddl text;
begin
  for r in
    select
      c.relname as table_name,
      pol.polname as policy_name,
      pol.polcmd,
      pol.polpermissive,
      pol.polroles,
      pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    new_using := app.wrap_rls_initplan(r.using_expr);
    new_check := app.wrap_rls_initplan(r.check_expr);
    if new_using is not distinct from r.using_expr
       and new_check is not distinct from r.check_expr then
      continue;
    end if;

    cmd := case r.polcmd
      when 'r' then 'select'
      when 'a' then 'insert'
      when 'w' then 'update'
      when 'd' then 'delete'
      else 'all'
    end;
    kind := case when r.polpermissive then 'permissive' else 'restrictive' end;

    select coalesce(string_agg(quote_ident(rolname), ', '), 'public')
      into role_list
    from pg_roles
    where oid = any (r.polroles);
    if r.polroles = '{}'::oid[] then
      role_list := 'public';
    end if;

    execute format('drop policy %I on public.%I', r.policy_name, r.table_name);

    ddl := format(
      'create policy %I on public.%I as %s for %s to %s',
      r.policy_name, r.table_name, kind, cmd, role_list
    );
    if new_using is not null then
      ddl := ddl || ' using (' || new_using || ')';
    end if;
    if new_check is not null then
      ddl := ddl || ' with check (' || new_check || ')';
    end if;
    execute ddl;
  end loop;
end $$;

drop function app.wrap_rls_initplan(text);

do $$
declare
  r record;
  idxname text;
begin
  for r in
    select
      c.relname as table_name,
      con.conname as fk_name,
      (
        select string_agg(quote_ident(a.attname), ', ' order by u.ord)
        from unnest(con.conkey) with ordinality as u(attnum, ord)
        join pg_attribute a
          on a.attrelid = con.conrelid
         and a.attnum = u.attnum
      ) as cols
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = con.conrelid
          and i.indisvalid
          and (i.indkey::smallint[])[0:cardinality(con.conkey) - 1] = con.conkey
      )
  loop
    idxname := left(r.fk_name || '_idx', 63);
    execute format(
      'create index if not exists %I on public.%I (%s)',
      idxname, r.table_name, r.cols
    );
  end loop;
end $$;
