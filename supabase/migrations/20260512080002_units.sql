create table public.units (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        citext not null unique,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  constraint units_name_unique unique (name)
);
create index units_active_idx on public.units(is_active);

create trigger units_set_updated_at
before update on public.units
for each row execute function app.set_updated_at();
