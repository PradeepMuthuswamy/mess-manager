import { format } from 'date-fns';

/** Date-only values are calendar days. `new Date('YYYY-MM-DD')` is UTC and shifts the day. */
export function formatStayDate(iso: string, pattern: string) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return format(new Date(year, (month ?? 1) - 1, day ?? 1), pattern);
}

export type RoomWaitlistRequest = {
  id: string;
  unit_id: string;
  profile_id: string;
  guest_name: string;
  requested_from: string;
  requested_to: string;
  notes: string | null;
  status: 'requested' | 'offered' | 'cancelled' | 'booked';
  created_at: string;
};
