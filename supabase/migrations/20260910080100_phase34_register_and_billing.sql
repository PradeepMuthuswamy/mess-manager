-- Phase 3 + 4 leftovers: register approval, guest meal billing flags,
-- party charges, bill email audit, guest self-host RLS, party line category.

-- ============================================================================
-- 1. Daily register approval (REQ-MES-21 / REQ-GOV-20 / REQ-GOV-21)
-- ============================================================================

alter table public.mess_daily_expenditures
  add column if not exists register_status text not null default 'draft',
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists reject_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mess_daily_expenditures_register_status_check'
  ) then
    alter table public.mess_daily_expenditures
      add constraint mess_daily_expenditures_register_status_check
      check (register_status in ('draft', 'submitted', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists idx_mess_daily_expenditures_register
  on public.mess_daily_expenditures (unit_id, register_status, expenditure_date desc);

drop policy if exists mess_daily_expenditures_write on public.mess_daily_expenditures;
create policy mess_daily_expenditures_write on public.mess_daily_expenditures
  for all to authenticated
  using (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('attendance.write', unit_id)
    or app.has_capability('messing.approve', unit_id)
  )
  with check (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or app.has_capability('attendance.write', unit_id)
    or app.has_capability('messing.approve', unit_id)
  );

-- ============================================================================
-- 2. Guest meals: self-host + billing idempotency
-- ============================================================================

alter table public.guest_meals
  add column if not exists is_billed boolean not null default false,
  add column if not exists billed_period_id uuid references public.mess_billing_periods(id) on delete set null;

create index if not exists idx_guest_meals_unbilled
  on public.guest_meals (unit_id, is_billed, meal_date);

drop policy if exists guest_meals_write on public.guest_meals;
create policy guest_meals_write on public.guest_meals
  for all to authenticated
  using (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or host_profile_id = auth.uid()
    or app.has_capability('attendance.write', unit_id)
  )
  with check (
    app.is_admin()
    or app.is_unit_admin_of(unit_id)
    or host_profile_id = auth.uid()
    or app.has_capability('attendance.write', unit_id)
  );

-- ============================================================================
-- 3. Misc debit re-run: remember which period billed the row
-- ============================================================================

alter table public.mess_misc_debits
  add column if not exists billed_period_id uuid references public.mess_billing_periods(id) on delete set null;

-- ============================================================================
-- 4. Party charges (lightweight Phase 4 rollup; full party module is Phase 5)
-- ============================================================================

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
-- 5. Bill email send log (REQ-BIL-16 / REQ-BIL-17)
-- ============================================================================

create table if not exists public.mess_bill_email_sends (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.mess_bills(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  billing_period_id uuid not null references public.mess_billing_periods(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bill_id)
);

create index if not exists idx_mess_bill_email_sends_period
  on public.mess_bill_email_sends (billing_period_id, status);

alter table public.mess_bill_email_sends enable row level security;

drop policy if exists mess_bill_email_sends_select on public.mess_bill_email_sends;
create policy mess_bill_email_sends_select on public.mess_bill_email_sends
  for select to authenticated
  using (
    app.is_admin()
    or profile_id = auth.uid()
    or exists (
      select 1 from public.mess_bills b
      where b.id = mess_bill_email_sends.bill_id
        and (app.is_unit_admin_of(b.unit_id) or app.has_capability('billing.finalize', b.unit_id))
    )
  );

drop policy if exists mess_bill_email_sends_write on public.mess_bill_email_sends;
create policy mess_bill_email_sends_write on public.mess_bill_email_sends
  for all to authenticated
  using (
    exists (
      select 1 from public.mess_bills b
      where b.id = mess_bill_email_sends.bill_id
        and (app.is_admin() or app.is_unit_admin_of(b.unit_id) or app.has_capability('billing.finalize', b.unit_id))
    )
  )
  with check (
    exists (
      select 1 from public.mess_bills b
      where b.id = mess_bill_email_sends.bill_id
        and (app.is_admin() or app.is_unit_admin_of(b.unit_id) or app.has_capability('billing.finalize', b.unit_id))
    )
  );

-- ============================================================================
-- 6. Line item category + party bucket on mess_bills
-- ============================================================================

alter table public.mess_bills
  add column if not exists party_amount numeric(12, 2) not null default 0;


alter table public.mess_bill_line_items
  drop constraint if exists mess_bill_line_items_category_check;

alter table public.mess_bill_line_items
  add constraint mess_bill_line_items_category_check
  check (category in ('messing', 'bar', 'room', 'guest_meal', 'subscription', 'misc', 'arrear', 'party'));

-- ============================================================================
-- 7. AAL2, grants, audit
-- ============================================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array['mess_party_charges', 'mess_bill_email_sends']
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

grant select, insert, update, delete on public.mess_party_charges to authenticated;
grant select, insert, update, delete on public.mess_bill_email_sends to authenticated;

drop trigger if exists audit_mess_party_charges on public.mess_party_charges;
create trigger audit_mess_party_charges
  after insert or update or delete on public.mess_party_charges
  for each row execute function app.audit_trigger();

drop trigger if exists audit_mess_bill_email_sends on public.mess_bill_email_sends;
create trigger audit_mess_bill_email_sends
  after insert or update or delete on public.mess_bill_email_sends
  for each row execute function app.audit_trigger();
