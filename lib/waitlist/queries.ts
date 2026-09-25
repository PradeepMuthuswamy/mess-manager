import 'server-only';
import type { Document } from 'mongodb';
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

  return rows.map((r: Document) => ({
    id: String(r.id || r._id?.toString() || ''),
    unit_id: String(r.unit_id || ''),
    profile_id: String(r.profile_id || ''),
    guest_name: String(r.guest_name || ''),
    requested_from: String(r.requested_from || ''),
    requested_to: String(r.requested_to || ''),
    notes: r.notes ? String(r.notes) : null,
    status: (r.status as RoomWaitlistRequest['status']) || 'requested',
    created_by: r.created_by ? String(r.created_by) : null,
    created_at: String(r.created_at || ''),
    updated_at: r.updated_at ? String(r.updated_at) : undefined,
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

  return rows.map((r: Document) => ({
    id: String(r.id || r._id?.toString() || ''),
    unit_id: String(r.unit_id || ''),
    profile_id: String(r.profile_id || ''),
    guest_name: String(r.guest_name || ''),
    requested_from: String(r.requested_from || ''),
    requested_to: String(r.requested_to || ''),
    notes: r.notes ? String(r.notes) : null,
    status: (r.status as RoomWaitlistRequest['status']) || 'requested',
    created_by: r.created_by ? String(r.created_by) : null,
    created_at: String(r.created_at || ''),
    updated_at: r.updated_at ? String(r.updated_at) : undefined,
  }));
}
