-- Admin unit list / switcher: active units ordered by name.
-- Unique(name) already indexes all names; this partial index matches
-- `.eq('is_active', true).order('name')` without scanning inactive rows.

create index if not exists units_active_name_idx
  on public.units (name)
  where is_active;

-- Code lookups besides the unique constraint (citext unique already exists).
-- Composite for mixed status filters on the admin units table.
create index if not exists units_is_active_updated_idx
  on public.units (is_active, updated_at desc);
