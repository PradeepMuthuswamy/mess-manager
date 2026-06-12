-- Guest contact details on bookings. The guest-rooms UI and zod schemas
-- (lib/schemas/guest-rooms.ts) already read/write these; the columns were
-- never added to the table, breaking the build against generated types.
alter table public.bookings
  add column if not exists guest_phone text,
  add column if not exists guest_email text;
