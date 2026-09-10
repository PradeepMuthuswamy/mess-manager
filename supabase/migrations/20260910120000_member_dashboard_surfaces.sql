-- Member dashboard surfaces: bulletins, parties, room waitlist.
-- Readable by every unit member. Writes are scoped (see policies).

-- ============================================================================
-- 1. Mess bulletins (unit notices)
-- ============================================================================

create table if not exists public.unit_bulletins (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_unit_bulletins_unit_published
  on public.unit_bulletins (unit_id, published_at desc);

alter table public.unit_bulletins enable row level security;

drop policy if exists unit_bulletins_select on public.unit_bulletins;
create policy unit_bulletins_select on public.unit_bulletins
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

drop policy if exists unit_bulletins_write on public.unit_bulletins;
create policy unit_bulletins_write on public.unit_bulletins
  for all to authenticated
  using (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or coalesce(app.current_role()::text, '') = 'mess_secretary'
  )
  with check (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or coalesce(app.current_role()::text, '') = 'mess_secretary'
  );

-- ============================================================================
-- 2. Parties (lightweight event list; charges roll to mess bill later)
-- ============================================================================

create table if not exists public.mess_parties (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  title text not null,
  party_date date not null,
  venue text,
  party_type text not null default 'mess' check (party_type in ('mess', 'individual')),
  host_profile_id uuid references public.profiles(id) on delete set null,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mess_parties_unit_date
  on public.mess_parties (unit_id, party_date desc);

alter table public.mess_parties enable row level security;

drop policy if exists mess_parties_select on public.mess_parties;
create policy mess_parties_select on public.mess_parties
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

drop policy if exists mess_parties_write on public.mess_parties;
create policy mess_parties_write on public.mess_parties
  for all to authenticated
  using (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or coalesce(app.current_role()::text, '') = 'mess_secretary'
    or app.has_capability('parties.write', unit_id)
    or created_by = auth.uid()
  )
  with check (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or coalesce(app.current_role()::text, '') = 'mess_secretary'
    or app.has_capability('parties.write', unit_id)
    or created_by = auth.uid()
  );

create table if not exists public.mess_party_charges (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  party_date date not null,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  is_billed boolean not null default false,
  billed_period_id uuid references public.mess_billing_periods(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_mess_party_charges_lookup
  on public.mess_party_charges (unit_id, profile_id, is_billed, party_date);

alter table public.mess_party_charges enable row level security;

drop policy if exists mess_party_charges_select on public.mess_party_charges;
create policy mess_party_charges_select on public.mess_party_charges
  for select to authenticated
  using (app.is_admin() or profile_id = auth.uid() or unit_id = app.current_unit_id());

drop policy if exists mess_party_charges_write on public.mess_party_charges;
create policy mess_party_charges_write on public.mess_party_charges
  for all to authenticated
  using (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('billing.draft', unit_id)
    or app.has_capability('parties.write', unit_id)
  )
  with check (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('billing.draft', unit_id)
    or app.has_capability('parties.write', unit_id)
  );

-- ============================================================================
-- 3. Guest-room waitlist
-- ============================================================================

create table if not exists public.room_waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  guest_name text not null,
  requested_from date not null,
  requested_to date not null,
  notes text,
  status text not null default 'requested' check (status in ('requested', 'offered', 'cancelled', 'booked')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint room_waitlist_dates_chk check (requested_to >= requested_from)
);

create index if not exists idx_room_waitlist_unit_status
  on public.room_waitlist_requests (unit_id, status, requested_from);

alter table public.room_waitlist_requests enable row level security;

drop policy if exists room_waitlist_select on public.room_waitlist_requests;
create policy room_waitlist_select on public.room_waitlist_requests
  for select to authenticated
  using (
    app.is_admin()
    or profile_id = auth.uid()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('rooms.read', unit_id)
  );

drop policy if exists room_waitlist_insert on public.room_waitlist_requests;
create policy room_waitlist_insert on public.room_waitlist_requests
  for insert to authenticated
  with check (profile_id = auth.uid() or app.is_admin() or app.is_unit_admin_of(unit_id));

drop policy if exists room_waitlist_update on public.room_waitlist_requests;
create policy room_waitlist_update on public.room_waitlist_requests
  for update to authenticated
  using (
    profile_id = auth.uid()
    or app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('rooms.booking.write', unit_id)
  )
  with check (
    profile_id = auth.uid()
    or app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('rooms.booking.write', unit_id)
  );

-- ============================================================================
-- 4. AAL2, grants, audit
-- ============================================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'unit_bulletins',
    'mess_parties',
    'mess_party_charges',
    'room_waitlist_requests'
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

grant select, insert, update, delete on public.unit_bulletins to authenticated;
grant select, insert, update, delete on public.mess_parties to authenticated;
grant select, insert, update, delete on public.mess_party_charges to authenticated;
grant select, insert, update, delete on public.room_waitlist_requests to authenticated;

drop trigger if exists audit_unit_bulletins on public.unit_bulletins;
create trigger audit_unit_bulletins
  after insert or update or delete on public.unit_bulletins
  for each row execute function app.audit_trigger();

drop trigger if exists audit_mess_parties on public.mess_parties;
create trigger audit_mess_parties
  after insert or update or delete on public.mess_parties
  for each row execute function app.audit_trigger();

drop trigger if exists audit_mess_party_charges on public.mess_party_charges;
create trigger audit_mess_party_charges
  after insert or update or delete on public.mess_party_charges
  for each row execute function app.audit_trigger();

drop trigger if exists audit_room_waitlist_requests on public.room_waitlist_requests;
create trigger audit_room_waitlist_requests
  after insert or update or delete on public.room_waitlist_requests
  for each row execute function app.audit_trigger();
