-- RLS policies on public.* call helper functions in the `app` schema
-- (app.is_admin, app.current_role, app.has_capability, ...). The
-- `authenticated` role had no USAGE on schema `app`, so every policy
-- evaluation failed with "permission denied for schema app" — which
-- masqueraded as "row not found" and broke the dashboard.
--
-- Grant usage on the schema and execute on each helper to `authenticated`
-- (and `anon`, since policy expressions are evaluated regardless of which
-- role hits the table).

grant usage on schema app to authenticated, anon;

grant execute on function app.current_role()            to authenticated, anon;
grant execute on function app.current_unit_id()         to authenticated, anon;
grant execute on function app.is_admin()                to authenticated, anon;
grant execute on function app.is_unit_admin_of(uuid)    to authenticated, anon;
grant execute on function app.has_capability(public.capability, uuid)
                                                        to authenticated, anon;
