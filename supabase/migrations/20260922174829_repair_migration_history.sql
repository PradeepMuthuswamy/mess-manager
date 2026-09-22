-- Recorded migration versions were the time they were applied, not the
-- filename timestamp the CLI uses. Point them at the repo filenames so
-- a later push does not run the same SQL again. One-off account seeds
-- stay applied; they are not part of the migration chain.

update supabase_migrations.schema_migrations
set version = substring(name from '^[0-9]{14}')
where name ~ '^[0-9]{14}_'
  and version is distinct from substring(name from '^[0-9]{14}');

update supabase_migrations.schema_migrations set version = '20260910120000' where name = 'member_dashboard_surfaces';
update supabase_migrations.schema_migrations set version = '20260910080000' where name = 'messing_approve_capability';
update supabase_migrations.schema_migrations set version = '20260910080100' where name = 'phase34_register_and_billing';
update supabase_migrations.schema_migrations set version = '20260910140000' where name = 'audit_security_and_billing_markers';
update supabase_migrations.schema_migrations set version = '20260910150000' where name = 'dash_calendar_party_reports';
update supabase_migrations.schema_migrations set version = '20260910163000' where name = 'units_admin_indexes';
update supabase_migrations.schema_migrations set version = '20260922173000' where name = 'rls_initplan_and_fk_indexes';

delete from supabase_migrations.schema_migrations
where name in (
  'seed_ui_check_secretary',
  'seed_mailpradeev_1sikh_unit_admin',
  'seed_demo_unit_agrani_admin',
  'promote_pradeep_super_admin'
);
