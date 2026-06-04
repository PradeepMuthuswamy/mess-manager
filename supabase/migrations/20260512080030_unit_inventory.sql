-- Per-Unit Inventory (Phase 1) — unit_inventory: one row = one purchase lot.
--
-- Same master item + same pack at different prices is expected (bought
-- ₹200 a year ago, ₹250 now). Price is a property of the LOT, not a
-- time-version of the item — so NO unique constraint on
-- (unit_id, item_id, pack_size_id) and no SCD-2 table; the audit trigger
-- provides full rate/qty history.

create table public.unit_inventory (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references public.units(id) on delete restrict,
  item_id        uuid not null references public.items(id) on delete restrict,
  pack_size_id   uuid not null references public.pack_sizes(id) on delete restrict,
  units_per_pack numeric(12,3) check (units_per_pack is null or units_per_pack > 0),
  unit_label     text,
  qty_packs      numeric(14,3) not null default 0 check (qty_packs >= 0),
  rate           numeric(12,2) not null check (rate >= 0),
  acquired_on    date,
  source         text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null
);
-- No unique constraint: multiple lots of the same item+pack at different
-- rates are expected.
create index unit_inventory_unit_item_idx on public.unit_inventory(unit_id, item_id);
create index unit_inventory_unit_active_idx on public.unit_inventory(unit_id) where is_active;

create trigger unit_inventory_set_updated_at
before update on public.unit_inventory
for each row execute function app.set_updated_at();

-- Audit trigger (existing pattern) — full rate/qty history, no SCD-2 table.
create trigger audit_unit_inventory
after insert or update or delete on public.unit_inventory
for each row execute function app.audit_trigger();

-- RLS: unit-scoped read; write gated on inventory.write for the lot's unit.
alter table public.unit_inventory enable row level security;

create policy unit_inventory_select on public.unit_inventory
  for select to authenticated
  using (app.is_admin() or unit_id = app.current_unit_id());

create policy unit_inventory_write on public.unit_inventory
  for all to authenticated
  using (app.is_admin() or app.has_capability('inventory.write', unit_id))
  with check (app.is_admin() or app.has_capability('inventory.write', unit_id));

-- Read-side view: lot joined with master item + pack metadata.
-- security_invoker = on so base-table RLS applies. No rate/value math
-- in SQL — that lives in pure TS (lib/inventory/compute.ts).
create or replace view public.v_unit_inventory_current
with (security_invoker = on)
as
select
  ui.id,
  ui.unit_id,
  ui.item_id,
  ui.pack_size_id,
  ui.units_per_pack,
  ui.unit_label,
  ui.qty_packs,
  ui.rate,
  ui.acquired_on,
  ui.source,
  ui.is_active,
  ui.created_at,
  ui.updated_at,
  ui.created_by,
  ui.updated_by,
  i.name          as item_name,
  i.category      as category,
  i.uom           as uom,
  ps.label        as pack_label,
  ps.volume_value as volume_value,
  ps.volume_uom   as volume_uom
from public.unit_inventory ui
join public.items i       on i.id = ui.item_id
join public.pack_sizes ps on ps.id = ui.pack_size_id;

comment on view public.v_unit_inventory_current is
  'Per-unit inventory lots joined with master item (name/category/uom) and pack_sizes (label/volume). Read-side; value math lives in TS.';

grant select on public.v_unit_inventory_current to authenticated;
