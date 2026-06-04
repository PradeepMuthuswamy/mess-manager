-- Per-unit mess classification. One mess type per unit; replaces per-person
-- rank_class. Consumed by the ration indent phase to resolve a scale.
-- units already has RLS (UPDATE = admin) and an audit_units trigger that
-- captures this new column, so no extra policy/audit work is needed here.

create type public.mess_type as enum ('officer', 'jco', 'or', 'combined');

alter table public.units add column mess_type public.mess_type;

comment on column public.units.mess_type is
  'Single mess classification per unit; drives ration scale resolution in later phases. Nullable until set.';
