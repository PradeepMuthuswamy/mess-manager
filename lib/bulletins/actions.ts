'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/require-role';
import { bulletinSchema } from '@/lib/schemas/bulletins';
import type { AuthUser } from '@/lib/auth/types';

type ActionResult = { ok: true } | { error: string };

function isUserUnit(user: AuthUser, unitId: string) {
  return unitId === user.homeUnitId || unitId === user.activeUnitId;
}

export async function publishBulletinAction(input: unknown): Promise<ActionResult> {
  const parsed = bulletinSchema.safeParse(input);
  if (!parsed.success) return { error: 'Title and body are required.' };

  const user = await requireRole(['unit_admin', 'mess_secretary', 'super_admin']);
  if (!isUserUnit(user, parsed.data.unit_id)) {
    return { error: 'You cannot publish to another unit.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('unit_bulletins').insert({
    unit_id: parsed.data.unit_id,
    title: parsed.data.title,
    body: parsed.data.body,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  revalidatePath('/bulletins');
  return { ok: true };
}
