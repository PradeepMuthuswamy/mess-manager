'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { createWaitlistSchema, waitlistIdSchema } from '@/lib/schemas/waitlist';
import { createBookingAction } from '@/lib/guest-rooms/actions';
import type { AuthUser } from '@/lib/auth/types';

type ActionResult = { ok: true } | { error: string };

function isUserUnit(user: AuthUser, unitId: string) {
  return unitId === user.homeUnitId || unitId === user.activeUnitId;
}

function revalidateWaitlist() {
  revalidatePath('/dashboard');
  revalidatePath('/waitlist');
  revalidatePath('/guest-rooms');
}

type WaitlistRow = { id: string; unit_id: string; status: string };

async function loadWaitlistRow(
  id: string,
): Promise<{ ok: true; row: WaitlistRow } | { ok: false; error: string }> {
  const parsed = waitlistIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: 'Invalid request.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_waitlist_requests')
    .select('id, unit_id, status')
    .eq('id', parsed.data)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Room request not found.' };
  return { ok: true, row: data };
}

export async function createWaitlistRequestAction(input: unknown): Promise<ActionResult> {
  const parsed = createWaitlistSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return { error: message && message !== 'Invalid input' ? message : 'Guest name and dates are required.' };
  }

  const user = await requireUser();
  if (!isUserUnit(user, parsed.data.unit_id)) {
    return { error: 'You cannot request a room in another unit.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('room_waitlist_requests').insert({
    unit_id: parsed.data.unit_id,
    profile_id: user.id,
    guest_name: parsed.data.guest_name,
    requested_from: parsed.data.requested_from,
    requested_to: parsed.data.requested_to,
    notes: parsed.data.notes ?? null,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidateWaitlist();
  return { ok: true };
}

export async function cancelWaitlistRequestAction(id: string, unitId: string): Promise<ActionResult> {
  const parsedId = waitlistIdSchema.safeParse(id);
  if (!parsedId.success) return { error: 'Invalid request.' };

  const user = await requireUser();
  if (!isUserUnit(user, unitId)) {
    return { error: 'You cannot cancel a request in another unit.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_waitlist_requests')
    .update({ status: 'cancelled' })
    .eq('id', parsedId.data)
    .eq('unit_id', unitId)
    .eq('profile_id', user.id)
    .in('status', ['requested', 'offered'])
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'This request can no longer be cancelled.' };
  revalidateWaitlist();
  return { ok: true };
}

export async function offerWaitlistAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const loaded = await loadWaitlistRow(id);
  if (!loaded.ok) return { error: loaded.error };

  if (!isUserUnit(user, loaded.row.unit_id)) {
    return { error: 'You cannot act on another unit.' };
  }

  await requireCapability('rooms.booking.write', loaded.row.unit_id);

  if (loaded.row.status !== 'requested') {
    return { error: 'Only an open request can be offered a room.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_waitlist_requests')
    .update({ status: 'offered' })
    .eq('id', loaded.row.id)
    .eq('unit_id', loaded.row.unit_id)
    .eq('status', 'requested')
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Request is no longer open.' };
  revalidateWaitlist();
  return { ok: true };
}

export async function markWaitlistBookedAction(id: string, roomId: string): Promise<ActionResult> {
  const user = await requireUser();
  const loaded = await loadWaitlistRow(id);
  if (!loaded.ok) return { error: loaded.error };

  if (!isUserUnit(user, loaded.row.unit_id)) {
    return { error: 'You cannot act on another unit.' };
  }

  await requireCapability('rooms.booking.write', loaded.row.unit_id);

  if (loaded.row.status !== 'offered') {
    return { error: 'Book a room after one has been offered.' };
  }

  const parsedRoom = waitlistIdSchema.safeParse(roomId);
  if (!parsedRoom.success) return { error: 'Choose a room.' };

  const supabase = await createClient();
  const { data: request, error: requestError } = await supabase
    .from('room_waitlist_requests')
    .select('guest_name, requested_from, requested_to, notes, profile_id, unit_id')
    .eq('id', loaded.row.id)
    .eq('status', 'offered')
    .maybeSingle();

  if (requestError) return { error: requestError.message };
  if (!request) return { error: 'Request is no longer offered.' };
  if (request.requested_to <= request.requested_from) {
    return { error: 'Check-out must be after check-in before this can be booked.' };
  }

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id')
    .eq('id', parsedRoom.data)
    .eq('unit_id', request.unit_id)
    .maybeSingle();

  if (roomError) return { error: roomError.message };
  if (!room) return { error: 'That room is not in this unit.' };

  const booked = await createBookingAction({
    unit_id: request.unit_id,
    room_id: parsedRoom.data,
    guest_name: request.guest_name,
    check_in_date: request.requested_from,
    check_out_date: request.requested_to,
    host_profile_id: request.profile_id,
    special_requests: request.notes,
    status: 'confirmed',
    booking_category: 'MEMBER_GUEST',
    settlement_type: 'DIRECT_SETTLEMENT',
  });
  if ('error' in booked) return { error: booked.error };

  const { data, error } = await supabase
    .from('room_waitlist_requests')
    .update({ status: 'booked' })
    .eq('id', loaded.row.id)
    .eq('unit_id', loaded.row.unit_id)
    .eq('status', 'offered')
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'The room was booked, but the request could not be closed.' };
  revalidateWaitlist();
  return { ok: true };
}
