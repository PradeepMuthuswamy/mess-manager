import { format } from 'date-fns';
import type { WaitlistRequest } from '@/lib/guest-rooms/types';

/** Date-only values are calendar days. `new Date('YYYY-MM-DD')` is UTC and shifts the day. */
export function formatStayDate(iso: string, pattern: string) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return format(new Date(year, (month ?? 1) - 1, day ?? 1), pattern);
}

export type RoomWaitlistRequest = WaitlistRequest;
export type { WaitlistRequest };
