create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  v_user_id uuid;
  v_role text;
  v_unit uuid;
begin
  v_user_id := (event ->> 'user_id')::uuid;

  select coalesce(p.role::text, 'user'), p.unit_id
    into v_role, v_unit
    from public.profiles p
   where p.id = v_user_id;

  if v_role is null then
    v_role := 'user';
  end if;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  -- Ensure app_metadata exists
  if claims ? 'app_metadata' then
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(v_role));
    claims := jsonb_set(claims, '{app_metadata,unit_id}',
      case when v_unit is null then 'null'::jsonb else to_jsonb(v_unit::text) end);
  else
    claims := jsonb_set(claims, '{app_metadata}',
      jsonb_build_object('role', v_role, 'unit_id', v_unit::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function app.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function app.custom_access_token_hook(jsonb) from public, authenticated, anon;

grant usage on schema app to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;
