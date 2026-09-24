import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { ObjectId } from 'mongodb';
import { auth } from '@/lib/auth/auth';
import { getDb } from '@/lib/mongo';

/**
 * Server-side MFA state. Cached per request so nested layouts/pages
 * that call requireUser() do not repeat lookups.
 */
export const getMfaState = cache(async (): Promise<{
  hasVerifiedFactor: boolean;
  isAal2: boolean;
}> => {
  let reqHeaders: Headers;
  try {
    reqHeaders = await headers();
  } catch {
    return { hasVerifiedFactor: false, isAal2: false };
  }

  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session?.user) {
    return { hasVerifiedFactor: false, isAal2: false };
  }

  if (session.user.twoFactorEnabled) {
    return { hasVerifiedFactor: true, isAal2: true };
  }

  const db = await getDb();
  const userId = session.user.id;
  const filter = ObjectId.isValid(userId)
    ? { $or: [{ userId: new ObjectId(userId) }, { userId: String(userId) }] }
    : { userId: String(userId) };

  const twoFactorRecord = await db.collection('twoFactor').findOne(filter);
  const hasVerifiedFactor = Boolean(twoFactorRecord && twoFactorRecord.verified !== false);

  return {
    hasVerifiedFactor,
    isAal2: false,
  };
});
