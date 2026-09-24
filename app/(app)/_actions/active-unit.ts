'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require-role';
import { getDb } from '@/lib/mongo';
import { ACTIVE_UNIT_COOKIE } from '@/lib/auth/types';

export async function setActiveUnitAction(unitId: string): Promise<void> {
  // Only admins use the unit switcher. unit_admins are pinned to their
  // home unit and shouldn't be able to spoof another unit context.
  await requireRole(['super_admin']);
  const cookieStore = await cookies();
  if (unitId === 'all') {
    cookieStore.delete(ACTIVE_UNIT_COOKIE);
  } else {
    const db = await getDb();
    const unit = await db
      .collection('units')
      .findOne({ id: unitId, is_active: true }, { projection: { id: 1 } });
    if (!unit) return;

    cookieStore.set(ACTIVE_UNIT_COOKIE, unitId, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      // ~30 days
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  revalidatePath('/', 'layout');
}
