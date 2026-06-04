-- 20260512080036_room_type_rls.sql
--
-- Let a unit_admin (not only a global admin) manage room-type masters for
-- their own unit, without granting blanket masters.write. Room types are
-- items with category='room', written via set_item_rate (security invoker),
-- so RLS must permit the writer. These are ADDITIVE permissive policies —
-- Postgres OR-combines permissive FOR ALL policies, so existing
-- items_write / item_versions_write are untouched and non-breaking.

create policy items_room_write on public.items
  for all to authenticated
  using (
    category = 'room'
    and (
      app.is_admin()
      or (
        app.current_role() = 'unit_admin'
        and unit_id = app.current_unit_id()
      )
    )
  )
  with check (
    category = 'room'
    and (
      app.is_admin()
      or (
        app.current_role() = 'unit_admin'
        and unit_id = app.current_unit_id()
      )
    )
  );

create policy item_versions_room_write on public.item_versions
  for all to authenticated
  using (exists (
    select 1 from public.items i
     where i.id = item_versions.item_id
       and i.category = 'room'
       and (
         app.is_admin()
         or (
           app.current_role() = 'unit_admin'
           and i.unit_id = app.current_unit_id()
         )
       )
  ))
  with check (exists (
    select 1 from public.items i
     where i.id = item_versions.item_id
       and i.category = 'room'
       and (
         app.is_admin()
         or (
           app.current_role() = 'unit_admin'
           and i.unit_id = app.current_unit_id()
         )
       )
  ));
