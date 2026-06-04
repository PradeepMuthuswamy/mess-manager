-- Per-Unit Inventory (Phase 1) — pack_sizes reference table.
--
-- Controlled vocabulary for pack/volume so the same bottle is never
-- typed three different ways ("750ml" vs "750 ml"). Global (not
-- unit-scoped), small, rarely changes — fetched once and cached.

create table public.pack_sizes (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  volume_value numeric(12,3),
  volume_uom   public.uom,
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  constraint pack_sizes_label_unique unique (label)
);
create index pack_sizes_sort_idx on public.pack_sizes(sort_order, label);
create index pack_sizes_active_idx on public.pack_sizes(is_active);

create trigger pack_sizes_set_updated_at
before update on public.pack_sizes
for each row execute function app.set_updated_at();

-- Audit trigger (existing pattern) — gives full change history for free.
create trigger audit_pack_sizes
after insert or update or delete on public.pack_sizes
for each row execute function app.audit_trigger();

-- RLS: readable by every authenticated user; written only by admins or
-- holders of masters.write (it is master/reference data).
alter table public.pack_sizes enable row level security;

create policy pack_sizes_select on public.pack_sizes
  for select to authenticated using (true);

create policy pack_sizes_write on public.pack_sizes
  for all to authenticated
  using (app.is_admin() or app.has_capability('masters.write', null))
  with check (app.is_admin() or app.has_capability('masters.write', null));

-- Seed common values. Bottles carry structured volume; boxes do not.
insert into public.pack_sizes (label, volume_value, volume_uom, sort_order) values
  ('180 ml',     180, 'ml', 10),
  ('375 ml',     375, 'ml', 20),
  ('750 ml',     750, 'ml', 30),
  ('1 L',          1, 'l',  40),
  ('2 L',          2, 'l',  50),
  ('Box of 10',  null, null, 60),
  ('Box of 20',  null, null, 70),
  ('Box of 25',  null, null, 80)
on conflict (label) do nothing;
