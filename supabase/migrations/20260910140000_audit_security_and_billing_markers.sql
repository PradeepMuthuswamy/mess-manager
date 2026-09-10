-- Audit follow-up: tighten member-surface RLS and add room folio billing markers.

-- ============================================================================
-- 1. Bills: unit-wide read is ops-only (not billing.read, which every member has)
-- ============================================================================

drop policy if exists mess_bills_select on public.mess_bills;
create policy mess_bills_select on public.mess_bills
  for select to authenticated
  using (
    app.is_admin()
    or (profile_id = auth.uid() and status in ('published', 'paid', 'overdue'))
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('billing.draft', unit_id)
    or app.has_capability('billing.finalize', unit_id)
  );

-- ============================================================================
-- 2. Bulletins / parties: scope secretary to home unit; drop created_by bypass
-- ============================================================================

drop policy if exists unit_bulletins_write on public.unit_bulletins;
create policy unit_bulletins_write on public.unit_bulletins
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

drop policy if exists mess_parties_write on public.mess_parties;
create policy mess_parties_write on public.mess_parties
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

drop policy if exists mess_party_charges_select on public.mess_party_charges;
create policy mess_party_charges_select on public.mess_party_charges
  for select to authenticated
  using (
    app.is_admin()
    or profile_id = auth.uid()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('billing.draft', unit_id)
    or app.has_capability('billing.finalize', unit_id)
  );

-- ============================================================================
-- 3. Waitlist insert must be unit-scoped
-- ============================================================================

drop policy if exists room_waitlist_insert on public.room_waitlist_requests;
create policy room_waitlist_insert on public.room_waitlist_requests
  for insert to authenticated
  with check (
    (
      profile_id = auth.uid()
      and unit_id = app.current_unit_id()
    )
    or app.is_admin()
    or app.is_unit_admin_of(unit_id)
  );

-- ============================================================================
-- 4. Room folio billing idempotency (draft re-run)
-- ============================================================================

alter table public.room_bills
  add column if not exists is_billed boolean not null default false,
  add column if not exists billed_period_id uuid references public.mess_billing_periods(id) on delete set null;

create index if not exists idx_room_bills_unbilled
  on public.room_bills (unit_id, is_billed);
