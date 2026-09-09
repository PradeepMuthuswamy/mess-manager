-- Phase 2 — ration ledger foundation
-- Consumption must be able to write an outflow stock transaction.
-- Auto-post flag on units (cron / attendance finalize hook).

alter table public.units
  add column if not exists auto_ration_post boolean not null default false;

comment on column public.units.auto_ration_post is
  'When true, finalized attendance may trigger daily ration consumption post.';

alter table public.ration_stock_transactions
  drop constraint if exists ration_stock_transactions_type_check;

alter table public.ration_stock_transactions
  add constraint ration_stock_transactions_type_check
  check (type in ('receipt', 'adjustment', 'return_to_source', 'consumption'));

alter table public.ration_stock_transactions
  drop constraint if exists ration_stock_transactions_quantity_check;

alter table public.ration_stock_transactions
  add constraint ration_stock_transactions_quantity_check
  check (
    (type = 'adjustment') or (quantity >= 0)
  );

comment on column public.ration_stock_transactions.type is
  'receipt / return_to_source / consumption (outflow) / adjustment (signed qty allowed).';
