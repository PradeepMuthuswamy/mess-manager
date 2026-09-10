-- One-off CommandHQ bootstrap: confirm the first super_admin (created via
-- Auth signup) and load the sample units from seed.sql.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email = 'pradeep@commandhq.in'
  and email_confirmed_at is null;

insert into public.units (name, code, description) values
  ('5 Madras Regiment', '5MAD', 'Sample unit'),
  ('1 Sikh Regiment', '1SIKH', 'Sample unit')
on conflict (code) do nothing;
