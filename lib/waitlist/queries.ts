import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { RoomWaitlistRequest } from './types';

const WAITLIST_COLUMNS =
  'id, unit_id, profile_id, guest_name, requested_from, requested_to, notes, status, created_at';

const OPEN_STATUSES = ['requested', 'offered'] as const;

export async function listMyWaitlist(unitId: string, profileId: string): Promise<RoomWaitlistRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_waitlist_requests')
    .select(WAITLIST_COLUMNS)
    .eq('unit_id', unitId)
    .eq('profile_id', profileId)
    .in('status', [...OPEN_STATUSES])
    .order('requested_from', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as RoomWaitlistRequest[];
}

export async function listUnitWaitlist(unitId: string): Promise<RoomWaitlistRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_waitlist_requests')
    .select(WAITLIST_COLUMNS)
    .eq('unit_id', unitId)
    .in('status', [...OPEN_STATUSES])
    .order('requested_from', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as RoomWaitlistRequest[];
}
