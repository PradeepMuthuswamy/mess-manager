-- Align items / item_versions WRITE policies with the rest of the schema:
-- admins bypass capability checks (matches units, profiles, ration_scales policies).
-- Fixes: admin users could not insert into items via UI even with TS layer permitting,
-- because the DB policy only honoured masters.write[.global] grants.

drop policy if exists items_write on public.items;

create policy items_write on public.items
  for all to authenticated
  using (
    app.is_admin()
    or case
         when unit_id is null then app.has_capability('masters.write.global', null)
         else app.has_capability('masters.write', unit_id)
       end
  )
  with check (
    app.is_admin()
    or case
         when unit_id is null then app.has_capability('masters.write.global', null)
         else app.has_capability('masters.write', unit_id)
       end
  );

drop policy if exists item_versions_write on public.item_versions;

create policy item_versions_write on public.item_versions
  for all to authenticated
  using (exists (
    select 1 from public.items i
     where i.id = item_versions.item_id
       and (
         app.is_admin()
         or (i.unit_id is null     and app.has_capability('masters.write.global', null))
         or (i.unit_id is not null and app.has_capability('masters.write', i.unit_id))
       )
  ))
  with check (exists (
    select 1 from public.items i
     where i.id = item_versions.item_id
       and (
         app.is_admin()
         or (i.unit_id is null     and app.has_capability('masters.write.global', null))
         or (i.unit_id is not null and app.has_capability('masters.write', i.unit_id))
       )
  ));
