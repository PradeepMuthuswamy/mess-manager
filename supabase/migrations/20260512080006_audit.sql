create table public.audit_log (
  id          bigserial primary key,
  table_name  text not null,
  row_pk      text not null,
  op          text not null check (op in ('INSERT','UPDATE','DELETE')),
  changed_at  timestamptz not null default now(),
  changed_by  uuid,
  active_unit_id uuid,
  old_data    jsonb,
  new_data    jsonb,
  diff        jsonb
);
create index audit_log_table_row_idx on public.audit_log(table_name, row_pk);
create index audit_log_changed_at_idx on public.audit_log(changed_at desc);
create index audit_log_changed_by_idx on public.audit_log(changed_by);

create or replace function app.audit_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_pk text;
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_active_unit uuid;
  k text;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end;
  v_pk  := case tg_op when 'DELETE' then (v_old->>'id') else (v_new->>'id') end;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if (v_new -> k) is distinct from (v_old -> k) then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('old', v_old->k, 'new', v_new->k));
      end if;
    end loop;
  end if;

  -- read active_unit_id from request claim if present (set by the API/SSR layer)
  begin
    v_active_unit := nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'active_unit_id', '')::uuid;
  exception when others then
    v_active_unit := null;
  end;

  insert into public.audit_log(table_name, row_pk, op, changed_by, active_unit_id, old_data, new_data, diff)
  values (
    tg_table_schema || '.' || tg_table_name,
    v_pk,
    tg_op,
    auth.uid(),
    v_active_unit,
    v_old,
    v_new,
    case when tg_op = 'UPDATE' then v_diff else null end
  );

  return coalesce(new, old);
end$$;

create trigger audit_units                 after insert or update or delete on public.units                 for each row execute function app.audit_trigger();
create trigger audit_profiles              after insert or update or delete on public.profiles              for each row execute function app.audit_trigger();
create trigger audit_items                 after insert or update or delete on public.items                 for each row execute function app.audit_trigger();
create trigger audit_item_versions         after insert or update or delete on public.item_versions         for each row execute function app.audit_trigger();
create trigger audit_user_capabilities     after insert or update or delete on public.user_capabilities     for each row execute function app.audit_trigger();
create trigger audit_capability_templates  after insert or update or delete on public.capability_templates  for each row execute function app.audit_trigger();
