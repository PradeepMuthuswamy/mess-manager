'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
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

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const bulletinDoc = {
    id,
    unit_id: parsed.data.unit_id,
    title: parsed.data.title,
    body: parsed.data.body,
    published_at: now,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  };

  await db.collection('unit_bulletins').insertOne(bulletinDoc);

  await writeAudit({
    table_name: 'unit_bulletins',
    row_pk: id,
    op: 'INSERT',
    changed_by: user.id,
    active_unit_id: parsed.data.unit_id,
    new_data: bulletinDoc,
  });

  revalidatePath('/dashboard');
  revalidatePath('/bulletins');
  return { ok: true };
}
