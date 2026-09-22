-- Role dashboards, social calendar, party lifecycle, bill format templates.

-- ============================================================================
-- 1. Unit config: enabled modules + bill print templates
-- ============================================================================

alter table public.units
  add column if not exists enabled_modules text[] not null default array[
    'attendance', 'ration', 'bar', 'guest_rooms', 'billing', 'parties', 'calendar'
  ],
  add column if not exists bill_format_template text not null default 'classic',
  add column if not exists room_bill_format_template text not null default 'classic';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'units_bill_format_template_check'
  ) then
    alter table public.units
      add constraint units_bill_format_template_check
      check (bill_format_template in ('classic', 'compact', 'formal'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'units_room_bill_format_template_check'
  ) then
    alter table public.units
      add constraint units_room_bill_format_template_check
      check (room_bill_format_template in ('classic', 'compact', 'formal'));
  end if;
end $$;

-- Recurring calendar hints on member profiles
alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists marriage_date date;

-- ============================================================================
-- 2. Party lifecycle (REQ-PTY)
-- ============================================================================

alter table public.mess_parties
  add column if not exists expected_headcount integer,
  add column if not exists budget_amount numeric(12, 2) not null default 0,
  add column if not exists budget_status text not null default 'draft',
  add column if not exists ration_cost numeric(12, 2) not null default 0,
  add column if not exists bar_cost numeric(12, 2) not null default 0,
  add column if not exists catering_cost numeric(12, 2) not null default 0,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mess_parties_budget_status_check'
  ) then
    alter table public.mess_parties
      add constraint mess_parties_budget_status_check
      check (budget_status in ('draft', 'submitted', 'approved', 'rejected'));
  end if;
end $$;

create table if not exists public.mess_party_guests (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.mess_parties(id) on delete cascade,
  guest_name text not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_mess_party_guests_party
  on public.mess_party_guests (party_id);

create table if not exists public.mess_party_cost_lines (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.mess_parties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete restrict,
  category text not null check (category in ('ration', 'bar', 'catering', 'other')),
  funding text not null check (funding in ('mess', 'host', 'guest')),
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_mess_party_cost_lines_party
  on public.mess_party_cost_lines (party_id, category);

-- ============================================================================
-- 3. Social calendar (REQ-SOC)
-- ============================================================================

create table if not exists public.social_calendar_events (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  event_date date not null,
  end_date date,
  event_type text not null check (
    event_type in (
      'anniversary', 'birthday', 'mess_party', 'individual_party',
      'formal_night', 'holiday', 'other'
    )
  ),
  title text not null,
  description text,
  profile_id uuid references public.profiles(id) on delete set null,
  party_id uuid references public.mess_parties(id) on delete set null,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint social_calendar_dates_chk check (end_date is null or end_date >= event_date)
);

create unique index if not exists idx_social_calendar_dedup
  on public.social_calendar_events (
    unit_id,
    event_date,
    event_type,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_social_calendar_unit_date
  on public.social_calendar_events (unit_id, event_date);

create table if not exists public.social_calendar_publishes (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  year integer not null,
  month integer not null check (month between 1 and 12),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  unique (unit_id, year, month)
);

-- ============================================================================
-- 4. RLS
-- ============================================================================

alter table public.mess_party_guests enable row level security;
alter table public.mess_party_cost_lines enable row level security;
alter table public.social_calendar_events enable row level security;
alter table public.social_calendar_publishes enable row level security;

drop policy if exists mess_party_guests_select on public.mess_party_guests;
create policy mess_party_guests_select on public.mess_party_guests
  for select to authenticated
  using (
    exists (
      select 1 from public.mess_parties p
      where p.id = mess_party_guests.party_id
        and (app.is_admin() or p.unit_id = app.current_unit_id())
    )
  );

drop policy if exists mess_party_guests_write on public.mess_party_guests;
create policy mess_party_guests_write on public.mess_party_guests
  for all to authenticated
  using (
    exists (
      select 1 from public.mess_parties p
      where p.id = mess_party_guests.party_id
        and (
          app.is_admin()
          or app.is_unit_admin_of(p.unit_id)
          or app.has_capability('parties.write', p.unit_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.mess_parties p
      where p.id = mess_party_guests.party_id
        and (
          app.is_admin()
          or app.is_unit_admin_of(p.unit_id)
          or app.has_capability('parties.write', p.unit_id)
        )
    )
  );

drop policy if exists mess_party_cost_lines_select on public.mess_party_cost_lines;
create policy mess_party_cost_lines_select on public.mess_party_cost_lines
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

drop policy if exists mess_party_cost_lines_write on public.mess_party_cost_lines;
create policy mess_party_cost_lines_write on public.mess_party_cost_lines
  for all to authenticated
  using (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('parties.write', unit_id)
    or app.has_capability('billing.draft', unit_id)
  )
  with check (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('parties.write', unit_id)
    or app.has_capability('billing.draft', unit_id)
  );

drop policy if exists social_calendar_events_select on public.social_calendar_events;
create policy social_calendar_events_select on public.social_calendar_events
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

drop policy if exists social_calendar_events_write on public.social_calendar_events;
create policy social_calendar_events_write on public.social_calendar_events
  for all to authenticated
  using (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or (
      coalesce(app.current_role()::text, '') = 'mess_secretary'
      and unit_id = app.current_unit_id()
    )
    or app.has_capability('parties.write', unit_id)
  )
  with check (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or (
      coalesce(app.current_role()::text, '') = 'mess_secretary'
      and unit_id = app.current_unit_id()
    )
    or app.has_capability('parties.write', unit_id)
  );

drop policy if exists social_calendar_publishes_select on public.social_calendar_publishes;
create policy social_calendar_publishes_select on public.social_calendar_publishes
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

drop policy if exists social_calendar_publishes_write on public.social_calendar_publishes;
create policy social_calendar_publishes_write on public.social_calendar_publishes
  for all to authenticated
  using (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or (
      coalesce(app.current_role()::text, '') = 'mess_secretary'
      and unit_id = app.current_unit_id()
    )
  )
  with check (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or (
      coalesce(app.current_role()::text, '') = 'mess_secretary'
      and unit_id = app.current_unit_id()
    )
  );

-- ============================================================================
-- 5. Audit, AAL2, grants
-- ============================================================================

drop trigger if exists audit_mess_party_guests on public.mess_party_guests;
create trigger audit_mess_party_guests
  after insert or update or delete on public.mess_party_guests
  for each row execute function app.audit_trigger();

drop trigger if exists audit_mess_party_cost_lines on public.mess_party_cost_lines;
create trigger audit_mess_party_cost_lines
  after insert or update or delete on public.mess_party_cost_lines
  for each row execute function app.audit_trigger();

drop trigger if exists audit_social_calendar_events on public.social_calendar_events;
create trigger audit_social_calendar_events
  after insert or update or delete on public.social_calendar_events
  for each row execute function app.audit_trigger();

drop trigger if exists audit_social_calendar_publishes on public.social_calendar_publishes;
create trigger audit_social_calendar_publishes
  after insert or update or delete on public.social_calendar_publishes
  for each row execute function app.audit_trigger();

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'mess_party_guests',
    'mess_party_cost_lines',
    'social_calendar_events',
    'social_calendar_publishes'
  ]
  loop
    execute format($f$
      drop policy if exists aal2_super_admin_insert_%1$s on public.%1$I;
      create policy aal2_super_admin_insert_%1$s on public.%1$I
        as restrictive for insert to authenticated
        with check (
          coalesce(app.current_role()::text, '') <> 'super_admin'
          or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
        );
      drop policy if exists aal2_super_admin_update_%1$s on public.%1$I;
      create policy aal2_super_admin_update_%1$s on public.%1$I
        as restrictive for update to authenticated
        using (
          coalesce(app.current_role()::text, '') <> 'super_admin'
          or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
        );
      drop policy if exists aal2_super_admin_delete_%1$s on public.%1$I;
      create policy aal2_super_admin_delete_%1$s on public.%1$I
        as restrictive for delete to authenticated
        using (
          coalesce(app.current_role()::text, '') <> 'super_admin'
          or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
        );
    $f$, tbl);
  end loop;
end $$;

grant select, insert, update, delete on public.mess_party_guests to authenticated;
grant select, insert, update, delete on public.mess_party_cost_lines to authenticated;
grant select, insert, update, delete on public.social_calendar_events to authenticated;
grant select, insert, update, delete on public.social_calendar_publishes to authenticated;
