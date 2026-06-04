-- Helper functions in app schema
create or replace function app.current_role()
returns public.user_role language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role')::public.user_role,
    'user'::public.user_role
  )
$$;

create or replace function app.current_unit_id()
returns uuid language sql stable as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'unit_id', '')::uuid
$$;

create or replace function app.is_admin() returns boolean
language sql stable as $$ select app.current_role() = 'admin' $$;

create or replace function app.is_unit_admin_of(p_unit uuid) returns boolean
language sql stable as $$
  select app.current_role() = 'unit_admin' and app.current_unit_id() = p_unit
$$;

create or replace function app.has_capability(p_cap public.capability, p_unit uuid default null)
returns boolean language sql stable as $$
  select case
    when app.current_role() = 'admin' then true
    when app.current_role() = 'unit_admin' and (p_unit is null or p_unit = app.current_unit_id()) then true
    else exists (
      select 1 from public.user_capabilities uc
       where uc.user_id = (select auth.uid())
         and uc.capability = p_cap
         and (uc.unit_id is null or uc.unit_id = p_unit)
    )
  end
$$;

-- Enable RLS on every public table
alter table public.units                 enable row level security;
alter table public.profiles              enable row level security;
alter table public.items                 enable row level security;
alter table public.item_versions         enable row level security;
alter table public.user_capabilities     enable row level security;
alter table public.capability_templates  enable row level security;
alter table public.audit_log             enable row level security;

-- units policies
create policy units_select_auth on public.units
  for select to authenticated using (true);

create policy units_write_admin on public.units
  for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- profiles policies
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or app.is_admin()
    or (app.current_role() in ('manager','unit_admin') and unit_id = app.current_unit_id())
  );

-- Inserts come from the auth trigger; block direct inserts except by admin or service_role.
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (app.is_admin());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_unit_admin on public.profiles
  for update to authenticated
  using (app.is_unit_admin_of(unit_id))
  with check (app.is_unit_admin_of(unit_id));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (app.is_admin());

-- items policies
create policy items_select on public.items
  for select to authenticated
  using (
    app.is_admin()
    or unit_id is null
    or unit_id = app.current_unit_id()
  );

create policy items_write on public.items
  for all to authenticated
  using (
    case
      when unit_id is null then app.has_capability('masters.write.global', null)
      else app.has_capability('masters.write', unit_id)
    end
  )
  with check (
    case
      when unit_id is null then app.has_capability('masters.write.global', null)
      else app.has_capability('masters.write', unit_id)
    end
  );

-- item_versions policies (inherit scope from parent item)
create policy item_versions_select on public.item_versions
  for select to authenticated
  using (exists (
    select 1 from public.items i
     where i.id = item_versions.item_id
       and (app.is_admin() or i.unit_id is null or i.unit_id = app.current_unit_id())
  ));

create policy item_versions_write on public.item_versions
  for all to authenticated
  using (exists (
    select 1 from public.items i
     where i.id = item_versions.item_id
       and (
         (i.unit_id is null and app.has_capability('masters.write.global', null))
         or (i.unit_id is not null and app.has_capability('masters.write', i.unit_id))
       )
  ))
  with check (exists (
    select 1 from public.items i
     where i.id = item_versions.item_id
       and (
         (i.unit_id is null and app.has_capability('masters.write.global', null))
         or (i.unit_id is not null and app.has_capability('masters.write', i.unit_id))
       )
  ));

-- user_capabilities policies
create policy user_capabilities_select on public.user_capabilities
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.is_admin()
    or app.is_unit_admin_of(unit_id)
  );

create policy user_capabilities_write_admin on public.user_capabilities
  for all to authenticated
  using (app.is_admin() or app.is_unit_admin_of(unit_id))
  with check (app.is_admin() or app.is_unit_admin_of(unit_id));

-- capability_templates policies
create policy capability_templates_select_auth on public.capability_templates
  for select to authenticated using (true);

create policy capability_templates_write_admin on public.capability_templates
  for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- audit_log policies
create policy audit_select_admin on public.audit_log
  for select to authenticated using (app.is_admin());
-- No INSERT/UPDATE/DELETE policies; only security-definer trigger writes.
