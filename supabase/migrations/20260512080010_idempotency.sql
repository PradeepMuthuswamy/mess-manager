create table public.idempotency_keys (
  key            text not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  request_hash   text not null,
  response_status int  not null,
  response_body  jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (key, user_id)
);
create index idempotency_keys_created_idx on public.idempotency_keys(created_at);

alter table public.idempotency_keys enable row level security;
-- only service_role writes; no client policy needed.
