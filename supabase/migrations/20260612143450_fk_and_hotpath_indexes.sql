-- Indexes derived from prisma/schema.prisma relations + mined query
-- patterns, deduplicated against the live pg_indexes inventory
-- (2026-06-12). The remote was already well-indexed; what was missing:
--
-- 1) Reverse-lookup FK indexes. Postgres does not auto-index FK columns;
--    these protect ON DELETE RESTRICT/SET NULL checks on product_variants
--    and categories from full scans, and serve per-variant reporting.
create index if not exists idx_categories_parent_id
  on public.categories (parent_id);
create index if not exists idx_unit_inventory_variant_id
  on public.unit_inventory (variant_id);
create index if not exists idx_rsiv_variant_id
  on public.ration_scale_item_versions (variant_id);
create index if not exists idx_room_bill_items_variant_id
  on public.room_bill_items (variant_id);
create index if not exists idx_ration_stock_txn_variant_id
  on public.ration_stock_transactions (variant_id);
create index if not exists idx_ration_consumptions_variant_id
  on public.ration_consumptions (variant_id);

-- 2) Hot-path composites mined from lib/**/queries.ts. Existing coverage
--    is single-column only; these match the canonical unit-scoped reads:
--    bar chit register (unit + day), ration ledger (unit + txn date),
--    guest-room calendar (unit + stay window).
create index if not exists idx_bar_chits_unit_date
  on public.bar_chits (unit_id, date desc);
create index if not exists idx_ration_stock_txn_unit_date
  on public.ration_stock_transactions (unit_id, transaction_date desc);
create index if not exists idx_bookings_unit_stay_window
  on public.bookings (unit_id, check_in_date, check_out_date);
