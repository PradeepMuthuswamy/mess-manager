import 'server-only';
import { getCollection } from '@/lib/mongo';
import type { RoomWaitlistRequest } from './types';

const OPEN_STATUSES = ['requested', 'offered'] as const;

export async function listMyWaitlist(
  unitId: string,
  profileId: string,
): Promise<RoomWaitlistRequest[]> {
  const col = await getCollection('room_waitlist_requests');
  const rows = await col
    .find({
      unit_id: unitId,
      profile_id: profileId,
      status: { $in: [...OPEN_STATUSES] },
    })
    .sort({ requested_from: 1 })
    .toArray();

  return rows.map((r: Partial<RoomWaitlistRequest> & { _id?: { toString(): string } }) => ({
    id: r.id || r._id?.toString(),
    unit_id: r.unit_id,
    profile_id: r.profile_id,
    guest_name: r.guest_name,
    requested_from: r.requested_from,
    requested_to: r.requested_to,
    notes: r.notes ?? null,
    status: r.status,
    created_at: r.created_at,
  }));
}

export async function listUnitWaitlist(unitId: string): Promise<RoomWaitlistRequest[]> {
  const col = await getCollection('room_waitlist_requests');
  const rows = await col
    .find({
      unit_id: unitId,
      status: { $in: [...OPEN_STATUSES] },
    })
    .sort({ requested_from: 1 })
    .toArray();

  return rows.map((r: Partial<RoomWaitlistRequest> & { _id?: { toString(): string } }) => ({
    id: r.id || r._id?.toString(),
    unit_id: r.unit_id,
    profile_id: r.profile_id,
    guest_name: r.guest_name,
    requested_from: r.requested_from,
    requested_to: r.requested_to,
    notes: r.notes ?? null,
    status: r.status,
    created_at: r.created_at,
  }));
}
