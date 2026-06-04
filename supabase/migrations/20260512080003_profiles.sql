create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  unit_id      uuid references public.units(id) on delete restrict,
  email        text,
  full_name    text,
  service_no   text,
  rank         text,
  role         public.user_role not null default 'user',
  is_active    boolean not null default true,
  display_name text generated always as (coalesce(full_name, email)) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  constraint profiles_unit_required check (role = 'admin' or unit_id is not null)
);
create index profiles_unit_idx on public.profiles(unit_id);
create index profiles_role_idx on public.profiles(role);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function app.set_updated_at();

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_user();

create or replace function app.guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_jwt_role text;
  v_app_role text;
begin
  v_jwt_role := coalesce(auth.role(), '');
  if v_jwt_role = 'service_role' then
    return new;
  end if;
  v_app_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), 'user');
  if (new.role is distinct from old.role) or (new.unit_id is distinct from old.unit_id) then
    if v_app_role <> 'admin' then
      raise exception 'Only admin may change role or unit_id' using errcode = '42501';
    end if;
  end if;
  return new;
end$$;

create trigger profiles_guard_role
before update on public.profiles
for each row execute function app.guard_profile_role_change();
