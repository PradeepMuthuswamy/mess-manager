-- v_ration_scale_items_current was recreated in 20260512080039_products_variants.sql
-- without security_invoker, so it ran as its owner (postgres) and bypassed RLS on
-- ration_scales / ration_scale_item_versions — any authenticated user could read
-- every unit's ration authorisations. Restore invoker rights so the base-table
-- unit-scoped policies apply, matching every other compatibility view.
alter view public.v_ration_scale_items_current set (security_invoker = on);
