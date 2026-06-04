-- Refresh capability templates to match the named mess roles users
-- actually think in: Mess Havildar (full ops), Mess Secretary (admin),
-- PMC (admin), Bar NCO (bar only). Existing fine-grained templates
-- (Quartermaster, Guest Room Clerk, Party Coordinator) stay.

-- Mess Havildar: full operational access in a single unit.
update public.capability_templates
   set description = 'Full operational access in the unit: messing, ration, bar, parties, guest rooms.',
       capabilities = array[
         'attendance.read','attendance.write','attendance.finalize',
         'ration.read','ration.issue','ration.adjust',
         'bar.read','bar.write','bar.finalize',
         'parties.read','parties.write','parties.finalize',
         'rooms.read','rooms.booking.write','rooms.manage',
         'masters.read',
         'billing.read','billing.draft',
         'reports.unit'
       ]::public.capability[]
 where name = 'Mess Havildar';

-- Mess Secretary: unit-level administrator. Caps cover ops + user
-- management + billing finalisation + reports. The recommended setup
-- is to also set the user's role to `unit_admin` for full unit reach.
insert into public.capability_templates (name, description, capabilities, is_system)
values (
  'Mess Secretary',
  'Unit administrator. Recommended: also set role to unit_admin for full unit reach.',
  array[
    'attendance.read','attendance.write','attendance.finalize',
    'ration.read','ration.issue','ration.adjust',
    'bar.read','bar.write','bar.finalize',
    'parties.read','parties.write','parties.finalize',
    'rooms.read','rooms.booking.write','rooms.manage',
    'masters.read','masters.write',
    'users.read','users.invite','users.manage',
    'billing.read','billing.draft','billing.finalize',
    'reports.unit'
  ]::public.capability[],
  true
)
on conflict (name) do update
  set description = excluded.description,
      capabilities = excluded.capabilities,
      is_system = excluded.is_system;

-- PMC (President of the Mess Committee): same admin-level set as Mess
-- Secretary; both are typically issued role = unit_admin.
insert into public.capability_templates (name, description, capabilities, is_system)
values (
  'PMC',
  'President of the Mess Committee. Recommended: also set role to unit_admin.',
  array[
    'attendance.read','attendance.write','attendance.finalize',
    'ration.read','ration.issue','ration.adjust',
    'bar.read','bar.write','bar.finalize',
    'parties.read','parties.write','parties.finalize',
    'rooms.read','rooms.booking.write','rooms.manage',
    'masters.read','masters.write',
    'users.read','users.invite','users.manage',
    'billing.read','billing.draft','billing.finalize',
    'reports.unit'
  ]::public.capability[],
  true
)
on conflict (name) do update
  set description = excluded.description,
      capabilities = excluded.capabilities,
      is_system = excluded.is_system;
