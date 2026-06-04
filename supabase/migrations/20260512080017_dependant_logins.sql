-- Optional login link for dependants. When a dependant is invited as a user,
-- the new auth.users row's id is recorded here so the dependant's profile and
-- their primary member's profile can be cross-walked.

alter table public.dependants
  add column auth_user_id uuid unique references auth.users(id) on delete set null;

create index dependants_auth_user_idx on public.dependants(auth_user_id);

-- Update the new-user trigger so dependant invites land with the correct
-- unit_id. Without this, the profile auto-created by Supabase would violate
-- the `profiles_unit_required` check (role='user' + unit_id=null) on accept.
-- Existing non-dependant flows are unchanged.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_dependant_id uuid;
  v_unit_id uuid;
begin
  begin
    v_dependant_id := nullif(new.raw_user_meta_data->>'dependant_id', '')::uuid;
  exception when others then
    v_dependant_id := null;
  end;

  if v_dependant_id is not null then
    select unit_id into v_unit_id from public.dependants where id = v_dependant_id;
  end if;

  insert into public.profiles (id, email, full_name, unit_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_unit_id
  );
  return new;
end$$;
