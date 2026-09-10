'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { partySchema } from '@/lib/schemas/parties';
import type { AuthUser } from '@/lib/auth/types';

type ActionResult = { ok: true } | { error: string };

function isUserUnit(user: AuthUser, unitId: string) {
  return unitId === user.homeUnitId || unitId === user.activeUnitId;
}

export async function createPartyAction(input: unknown): Promise<ActionResult> {
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) return { error: 'Check the party date and title.' };

  const user = await requireUser();
  if (!isUserUnit(user, parsed.data.unit_id)) {
    return { error: 'You cannot create a party for another unit.' };
  }

  // unit_admin / mess_secretary already pass parties.write via requireCapability.
  await requireCapability('parties.write', parsed.data.unit_id);

  const supabase = await createClient();
  const { error } = await supabase.from('mess_parties').insert({
    unit_id: parsed.data.unit_id,
    title: parsed.data.title,
    party_date: parsed.data.party_date,
    venue: parsed.data.venue ?? null,
    party_type: parsed.data.party_type,
    host_profile_id: parsed.data.party_type === 'individual' ? user.id : null,
    notes: parsed.data.notes ?? null,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/party');
  return { ok: true };
}
