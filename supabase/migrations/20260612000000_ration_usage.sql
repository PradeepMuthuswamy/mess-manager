-- Migration to support Ration Stock Transactions and Daily Issues/Usage tracking.

-- 1. Create Ration Stock Transactions Table
create table public.ration_stock_transactions (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units(id) on delete restrict,
  variant_id       uuid not null references public.product_variants(id) on delete restrict,
  transaction_date date not null,
  type             text not null check (type in ('receipt', 'adjustment', 'return_to_source')),
  quantity         numeric(14,4) not null check (quantity >= 0),
  rate             numeric(12,2) not null check (rate >= 0),
  amount           numeric(12,2) not null check (amount >= 0),
  source           text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null
);

create index ration_stock_transactions_unit_idx on public.ration_stock_transactions(unit_id);
create index ration_stock_transactions_date_idx on public.ration_stock_transactions(transaction_date);

create trigger ration_stock_transactions_set_updated_at
before update on public.ration_stock_transactions
for each row execute function app.set_updated_at();

-- 2. Create Ration Daily Issues Table
create table public.ration_daily_issues (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units(id) on delete restrict,
  issue_date       date not null,
  variant_id       uuid not null references public.product_variants(id) on delete restrict,
  qty_issued       numeric(14,4) not null check (qty_issued >= 0),
  qty_returned     numeric(14,4) not null default 0 check (qty_returned >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  constraint ration_daily_issues_unique unique (unit_id, issue_date, variant_id),
  constraint ration_daily_issues_qty_check check (qty_returned <= qty_issued)
);

create index ration_daily_issues_unit_idx on public.ration_daily_issues(unit_id);
create index ration_daily_issues_date_idx on public.ration_daily_issues(issue_date);

create trigger ration_daily_issues_set_updated_at
before update on public.ration_daily_issues
for each row execute function app.set_updated_at();

-- 3. RLS Gating
alter table public.ration_stock_transactions enable row level security;
alter table public.ration_daily_issues enable row level security;

-- Ration Stock Transactions Policies
create policy ration_stock_transactions_select on public.ration_stock_transactions
  for select to authenticated
  using (app.is_admin() or app.has_capability('ration.read', unit_id));

create policy ration_stock_transactions_insert on public.ration_stock_transactions
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('ration.adjust', unit_id));

create policy ration_stock_transactions_update on public.ration_stock_transactions
  for update to authenticated
  using (app.is_admin() or app.has_capability('ration.adjust', unit_id))
  with check (app.is_admin() or app.has_capability('ration.adjust', unit_id));

create policy ration_stock_transactions_delete on public.ration_stock_transactions
  for delete to authenticated
  using (app.is_admin() or app.has_capability('ration.adjust', unit_id));

-- Ration Daily Issues Policies
create policy ration_daily_issues_select on public.ration_daily_issues
  for select to authenticated
  using (app.is_admin() or app.has_capability('ration.read', unit_id));

create policy ration_daily_issues_insert on public.ration_daily_issues
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('ration.issue', unit_id) or app.has_capability('ration.adjust', unit_id));

create policy ration_daily_issues_update on public.ration_daily_issues
  for update to authenticated
  using (app.is_admin() or app.has_capability('ration.issue', unit_id) or app.has_capability('ration.adjust', unit_id))
  with check (app.is_admin() or app.has_capability('ration.issue', unit_id) or app.has_capability('ration.adjust', unit_id));

create policy ration_daily_issues_delete on public.ration_daily_issues
  for delete to authenticated
  using (app.is_admin() or app.has_capability('ration.issue', unit_id) or app.has_capability('ration.adjust', unit_id));

-- 4. Grants
grant select, insert, update, delete on public.ration_stock_transactions to authenticated;
grant select, insert, update, delete on public.ration_daily_issues to authenticated;

-- 5. Audit Logging Triggers
create trigger audit_ration_stock_transactions
after insert or update or delete on public.ration_stock_transactions
for each row execute function app.audit_trigger();

create trigger audit_ration_daily_issues
after insert or update or delete on public.ration_daily_issues
for each row execute function app.audit_trigger();
