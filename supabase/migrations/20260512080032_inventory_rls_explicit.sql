-- Inventory RLS hardening — replace `for all` write policies with explicit
-- per-operation policies. AGENTS.md forbids blanket `for all` policies:
-- one policy per intended writer/operation, predicates unchanged.
--
-- Applies to both public.pack_sizes and public.unit_inventory. Existing
-- `*_select` policies are intentionally left untouched. App does soft-delete
-- (is_active = false); a true row delete is admin-only.

-- pack_sizes ----------------------------------------------------------------
drop policy pack_sizes_write on public.pack_sizes;

create policy pack_sizes_insert on public.pack_sizes
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('masters.write', null));

create policy pack_sizes_update on public.pack_sizes
  for update to authenticated
  using (app.is_admin() or app.has_capability('masters.write', null))
  with check (app.is_admin() or app.has_capability('masters.write', null));

create policy pack_sizes_delete_admin on public.pack_sizes
  for delete to authenticated using (app.is_admin());

-- unit_inventory ------------------------------------------------------------
drop policy unit_inventory_write on public.unit_inventory;

create policy unit_inventory_insert on public.unit_inventory
  for insert to authenticated
  with check (app.is_admin() or app.has_capability('inventory.write', unit_id));

create policy unit_inventory_update on public.unit_inventory
  for update to authenticated
  using (app.is_admin() or app.has_capability('inventory.write', unit_id))
  with check (app.is_admin() or app.has_capability('inventory.write', unit_id));

create policy unit_inventory_delete_admin on public.unit_inventory
  for delete to authenticated using (app.is_admin());
