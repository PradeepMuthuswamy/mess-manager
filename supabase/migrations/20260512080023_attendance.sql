-- Attendance (Phase 1): daily dining-in attendance for a unit.
--
-- Model: "default present, store only absentees". The roster is derived from
-- profiles + dependants flagged dining_in. An attendance_days header carries
-- per-(unit,date) status/finalize. attendance_absences holds one row per
-- absent person (profile XOR dependant). Present = absence of an absence row.

-- Opt-in dining-in flag on existing people ---------------------------------
alter table public.profiles   add column dining_in boolean not null default false;
alter table public.dependants add column dining_in boolean not null default false;
create index profiles_dining_idx   on public.profiles(unit_id)   where dining_in;
create index dependants_dining_idx on public.dependants(unit_id) where dining_in;

-- Header -------------------------------------------------------------------
create type public.attendance_status as enum ('draft', 'finalized');

create table public.attendance_days (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete restrict,
  attendance_date date not null,
  status          public.attendance_status not null default 'draft',
  finalized_at    timestamptz,
  finalized_by    uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  constraint attendance_days_unique unique (unit_id, attendance_date)
);
create index attendance_days_unit_date_idx on public.attendance_days(unit_id, attendance_date);

create trigger attendance_days_set_updated_at
  before update on public.attendance_days
  for each row execute function app.set_updated_at();

-- Absentees (sparse) -------------------------------------------------------
create table public.attendance_absences (
  id           uuid primary key default gen_random_uuid(),
  day_id       uuid not null references public.attendance_days(id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete cascade,
  dependant_id uuid references public.dependants(id) on delete cascade,
  reason       text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  constraint attendance_absence_one_person
    check ( (profile_id is not null)::int + (dependant_id is not null)::int = 1 )
);
create unique index attendance_absence_profile_ux
  on public.attendance_absences(day_id, profile_id) where profile_id is not null;
create unique index attendance_absence_dependant_ux
  on public.attendance_absences(day_id, dependant_id) where dependant_id is not null;
create index attendance_absences_day_idx on public.attendance_absences(day_id);

-- Lock guard: no absence writes once the day is finalized (defense in depth;
-- the server action also enforces this). security definer + empty search_path
-- per the project convention for app.* functions used around RLS.
create or replace function app.attendance_day_not_finalized()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.attendance_status;
begin
  select status into v_status
    from public.attendance_days
   where id = coalesce(new.day_id, old.day_id);
  if v_status = 'finalized' then
    raise exception 'Attendance day is finalized; reopen before editing'
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end$$;

create trigger attendance_absences_lock
  before insert or update or delete on public.attendance_absences
  for each row execute function app.attendance_day_not_finalized();

-- RLS ----------------------------------------------------------------------
alter table public.attendance_days     enable row level security;
alter table public.attendance_absences enable row level security;

create policy attendance_days_select on public.attendance_days
  for select to authenticated
  using (app.is_admin() or app.has_capability('attendance.read', unit_id));

create policy attendance_days_insert on public.attendance_days
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('attendance.write', unit_id));

create policy attendance_days_update on public.attendance_days
  for update to authenticated
  using (app.is_admin() or app.has_capability('attendance.write', unit_id))
  with check (app.is_admin() or app.has_capability('attendance.write', unit_id));

create policy attendance_days_delete on public.attendance_days
  for delete to authenticated
  using (app.is_admin());

create policy attendance_absences_select on public.attendance_absences
  for select to authenticated
  using (
    exists (
      select 1 from public.attendance_days d
      where d.id = attendance_absences.day_id
        and (app.is_admin() or app.has_capability('attendance.read', d.unit_id))
    )
  );

create policy attendance_absences_insert on public.attendance_absences
  for insert to authenticated
  with check (
    exists (
      select 1 from public.attendance_days d
      where d.id = attendance_absences.day_id
        and (app.is_admin() or app.has_capability('attendance.write', d.unit_id))
    )
  );

create policy attendance_absences_update on public.attendance_absences
  for update to authenticated
  using (
    exists (
      select 1 from public.attendance_days d
      where d.id = attendance_absences.day_id
        and (app.is_admin() or app.has_capability('attendance.write', d.unit_id))
    )
  )
  with check (
    exists (
      select 1 from public.attendance_days d
      where d.id = attendance_absences.day_id
        and (app.is_admin() or app.has_capability('attendance.write', d.unit_id))
    )
  );

create policy attendance_absences_delete on public.attendance_absences
  for delete to authenticated
  using (
    exists (
      select 1 from public.attendance_days d
      where d.id = attendance_absences.day_id
        and (app.is_admin() or app.has_capability('attendance.write', d.unit_id))
    )
  );

-- Audit --------------------------------------------------------------------
create trigger audit_attendance_days      after insert or update or delete on public.attendance_days      for each row execute function app.audit_trigger();
create trigger audit_attendance_absences  after insert or update or delete on public.attendance_absences  for each row execute function app.audit_trigger();
