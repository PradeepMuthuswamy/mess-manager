-- Supabase Auth looks up public.custom_access_token_hook. Delegate to the
-- app schema function so role and unit_id are copied into the access token.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.custom_access_token_hook($1);
$$;

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
