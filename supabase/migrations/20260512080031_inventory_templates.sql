-- Per-Unit Inventory (Phase 1) — wire the new capabilities into the
-- named role templates. Separate migration so the enum values added in
-- 20260512080028 are committed and usable here.
--
-- Quartermaster + Bar NCO get inventory.read + inventory.write;
-- Mess Havildar gets inventory.read (it already has masters.read but
-- only needs to view stock, not maintain it).
--
-- Append-if-absent via array filtering so the migration is idempotent
-- and does not disturb the rest of each template's canonical array.

update public.capability_templates
   set capabilities = (
     select array(select distinct unnest(
       capabilities
       || array['inventory.read','inventory.write']::public.capability[]
     ))
   )
 where name in ('Quartermaster', 'Bar NCO')
   and not (capabilities @> array['inventory.read','inventory.write']::public.capability[]);

update public.capability_templates
   set capabilities = (
     select array(select distinct unnest(
       capabilities
       || array['inventory.read']::public.capability[]
     ))
   )
 where name = 'Mess Havildar'
   and not (capabilities @> array['inventory.read']::public.capability[]);
