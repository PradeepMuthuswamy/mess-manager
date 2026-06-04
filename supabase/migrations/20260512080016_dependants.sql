-- Dependants: family members (spouse / child / parent) attached to a primary profile.
-- Dependants don't have auth.users records; they live entirely in public.dependants.
-- Their unit_id must always match the primary profile's unit_id (enforced by trigger).

create type public.relation_type as enum ('spouse', 'child', 'parent');

create table public.dependants (
  id                 uuid primary key default gen_random_uuid(),
  primary_profile_id uuid not null references public.profiles(id) on delete cascade,
  unit_id            uuid not null references public.units(id) on delete restrict,
  full_name          text not null,
  relation           public.relation_type not null,
  date_of_birth      date,
  gender             text,
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  updated_by         uuid references auth.users(id) on delete set null,
  constraint dependants_full_name_nonempty check (length(btrim(full_name)) > 0)
);

create index dependants_primary_idx on public.dependants(primary_profile_id);
create index dependants_unit_idx    on public.dependants(unit_id);
create index dependants_unit_active_idx on public.dependants(unit_id, is_active);

create trigger dependants_set_updated_at
before update on public.dependants
for each row execute function app.set_updated_at();

-- Keep dependant.unit_id consistent with the primary profile's unit_id.
create or replace function app.dependant_unit_consistency()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_profile_unit uuid;
begin
  select unit_id into v_profile_unit from public.profiles where id = new.primary_profile_id;
  if v_profile_unit is null then
    raise exception 'Primary profile % has no unit; dependants need a unit-scoped primary', new.primary_profile_id
      using errcode = '23514';
  end if;
  if new.unit_id is distinct from v_profile_unit then
    raise exception 'Dependant unit_id (%) must match primary profile unit_id (%)', new.unit_id, v_profile_unit
      using errcode = '23514';
  end if;
  return new;
end$$;

create trigger dependants_unit_consistency
before insert or update on public.dependants
for each row execute function app.dependant_unit_consistency();

-- Audit
create trigger audit_dependants
after insert or update or delete on public.dependants
for each row execute function app.audit_trigger();

-- RLS
alter table public.dependants enable row level security;

-- SELECT: admin sees all; unit members see their unit's dependants;
-- the primary profile owner sees their own dependants regardless of role.
create policy dependants_select on public.dependants
  for select to authenticated
  using (
    app.is_admin()
    or primary_profile_id = (select auth.uid())
    or (app.current_role() in ('manager','unit_admin') and unit_id = app.current_unit_id())
    or app.has_capability('users.read', unit_id)
  );

-- INSERT
create policy dependants_insert_admin on public.dependants
  for insert to authenticated
  with check (app.is_admin());

create policy dependants_insert_unit_admin on public.dependants
  for insert to authenticated
  with check (app.is_unit_admin_of(unit_id));

create policy dependants_insert_capability on public.dependants
  for insert to authenticated
  with check (app.has_capability('users.manage', unit_id));

-- UPDATE
create policy dependants_update_admin on public.dependants
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

create policy dependants_update_unit_admin on public.dependants
  for update to authenticated
  using (app.is_unit_admin_of(unit_id))
  with check (app.is_unit_admin_of(unit_id));

create policy dependants_update_capability on public.dependants
  for update to authenticated
  using (app.has_capability('users.manage', unit_id))
  with check (app.has_capability('users.manage', unit_id));

-- DELETE
create policy dependants_delete_admin on public.dependants
  for delete to authenticated
  using (app.is_admin());

create policy dependants_delete_unit_admin on public.dependants
  for delete to authenticated
  using (app.is_unit_admin_of(unit_id));

create policy dependants_delete_capability on public.dependants
  for delete to authenticated
  using (app.has_capability('users.manage', unit_id));
