-- Master ration scales (global templates).
--
-- Product decision: the admin app curates "master" ration scales that act as
-- templates; units browse them and create their own unit-owned copy (a new
-- ration_scales row with unit_id set, items pre-filled from the master).
--
-- Representation: a master scale is a ration_scales row with unit_id IS NULL.
-- Unit scales keep unit_id NOT NULL via FK as before. No live linkage between
-- master and unit copies — units own their rows after creation.

-- 1. Allow unit_id to be null (master scales have no unit).
alter table public.ration_scales
  alter column unit_id drop not null;

-- 2. The (unit_id, rank_class, terrain) unique constraint does not apply when
--    unit_id is null (NULLs never collide in a regular unique constraint), so
--    enforce one master scale per (rank_class, terrain) with a partial index.
create unique index if not exists ration_scales_master_unique_dims
  on public.ration_scales(rank_class, terrain)
  where unit_id is null;

-- 3. RLS adjustments.
--
-- Master scales (unit_id is null) must be readable by every authenticated user
-- (they are templates), but writable only by global admins. The existing
-- policies delegate to app.has_capability(cap, unit_id); with a NULL unit that
-- helper returns true for any unit_admin (the `p_unit is null` branch), which
-- would let unit admins edit the global masters. Recreate the policies with
-- explicit master-scale arms.

drop policy if exists ration_scales_select on public.ration_scales;
create policy ration_scales_select on public.ration_scales
  for select to authenticated
  using (
    unit_id is null  -- master scales are global templates, visible to all
    or app.is_admin()
    or app.has_capability('ration.read', unit_id)
    or app.has_capability('masters.read', unit_id)
  );

drop policy if exists ration_scales_insert on public.ration_scales;
create policy ration_scales_insert on public.ration_scales
  for insert to authenticated
  with check (
    case
      when unit_id is null then app.is_admin()
      else app.is_admin() or app.has_capability('ration.adjust', unit_id)
    end
  );

drop policy if exists ration_scales_update on public.ration_scales;
create policy ration_scales_update on public.ration_scales
  for update to authenticated
  using (
    case
      when unit_id is null then app.is_admin()
      else app.is_admin() or app.has_capability('ration.adjust', unit_id)
    end
  )
  with check (
    case
      when unit_id is null then app.is_admin()
      else app.is_admin() or app.has_capability('ration.adjust', unit_id)
    end
  );

-- Delete stays admin-only (unchanged), covers master scales too.

-- Item versions: same pattern — master-scale items readable by all, writable
-- only by admins; unit-scale items keep capability-scoped behaviour.
drop policy if exists rsiv_select on public.ration_scale_item_versions;
create policy rsiv_select on public.ration_scale_item_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.ration_scales s
      where s.id = ration_scale_item_versions.scale_id
        and (
          s.unit_id is null
          or app.is_admin()
          or app.has_capability('ration.read', s.unit_id)
          or app.has_capability('masters.read', s.unit_id)
        )
    )
  );

drop policy if exists rsiv_insert on public.ration_scale_item_versions;
create policy rsiv_insert on public.ration_scale_item_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ration_scales s
      where s.id = ration_scale_item_versions.scale_id
        and (
          case
            when s.unit_id is null then app.is_admin()
            else app.is_admin() or app.has_capability('ration.adjust', s.unit_id)
          end
        )
    )
  );

drop policy if exists rsiv_update on public.ration_scale_item_versions;
create policy rsiv_update on public.ration_scale_item_versions
  for update to authenticated
  using (
    exists (
      select 1 from public.ration_scales s
      where s.id = ration_scale_item_versions.scale_id
        and (
          case
            when s.unit_id is null then app.is_admin()
            else app.is_admin() or app.has_capability('ration.adjust', s.unit_id)
          end
        )
    )
  )
  with check (
    exists (
      select 1 from public.ration_scales s
      where s.id = ration_scale_item_versions.scale_id
        and (
          case
            when s.unit_id is null then app.is_admin()
            else app.is_admin() or app.has_capability('ration.adjust', s.unit_id)
          end
        )
    )
  );

-- rsiv_delete stays admin-only (unchanged).
