-- Add full-text search column to products table
alter table public.products
  add column if not exists fts tsvector generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored;

-- Create GIN index for full-text search on products
create index if not exists products_fts_idx on public.products using gin(fts);

-- Create B-tree index on variant SKU for faster code-based lookups
create index if not exists product_variants_sku_idx on public.product_variants(sku);

-- Create indexes on join columns and status flags to optimize masters list queries
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_unit_id_idx on public.products(unit_id) where unit_id is not null;
create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
create index if not exists product_variants_is_active_idx on public.product_variants(is_active);
