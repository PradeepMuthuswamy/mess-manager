create table public.user_capabilities (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  capability public.capability not null,
  unit_id    uuid references public.units(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, capability, unit_id)
);
create index user_capabilities_user_idx on public.user_capabilities(user_id);
create index user_capabilities_unit_idx on public.user_capabilities(unit_id);

create unique index user_capabilities_global_unique
  on public.user_capabilities(user_id, capability) where unit_id is null;

create table public.capability_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  capabilities public.capability[] not null,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null
);

create trigger capability_templates_set_updated_at
before update on public.capability_templates
for each row execute function app.set_updated_at();

insert into public.capability_templates (name, description, capabilities, is_system) values
  ('Bar NCO',           'Operate the bar: log consumption, view related parties.',
    array['bar.read','bar.write','parties.read']::public.capability[], true),
  ('Mess Havildar',     'Run daily messing: attendance and ration issuing.',
    array['attendance.read','attendance.write','ration.read','ration.issue','masters.read']::public.capability[], true),
  ('Quartermaster',     'Manage masters and ration adjustments.',
    array['masters.read','masters.write','ration.read','ration.adjust']::public.capability[], true),
  ('Guest Room Clerk',  'Handle guest room bookings.',
    array['rooms.read','rooms.booking.write']::public.capability[], true),
  ('Party Coordinator', 'Plan and record parties.',
    array['parties.read','parties.write']::public.capability[], true)
on conflict (name) do nothing;
