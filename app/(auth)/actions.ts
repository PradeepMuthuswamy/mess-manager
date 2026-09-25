'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { auth } from '@/lib/auth/auth';
import { signInSchema } from '@/lib/schemas/auth';
import { sendMagicLinkEmail } from '@/lib/email/resend';
import {
  generateVerificationToken,
  buildAuthConfirmLink,
} from '@/lib/auth/email-links';
import { getDb } from '@/lib/mongo';
import { ObjectId } from 'mongodb';

export type ActionState = {
  error?: string;
  ok?: boolean;
};

function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '/dashboard';
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export async function signInAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'Please enter a valid email and password.' };
  }

  const reqHeaders = await headers();
  const next = safeNextPath(formData.get('next'));

  try {
    const res = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
      headers: reqHeaders,
    });

    if (res && 'user' in res && res.user) {
      const db = await getDb();
      const userId = res.user.id;
      const filter = ObjectId.isValid(userId)
        ? { $or: [{ _id: new ObjectId(userId) }, { id: userId }] }
        : { id: userId };

      const userDoc = await db.collection('users').findOne(filter)
        || await db.collection('user').findOne(filter);

      const role = userDoc?.role ?? (res.user as Record<string, unknown>).role;
      if (role === 'super_admin' || role === 'admin') {
        await auth.api.signOut({ headers: await headers() });
        return { error: 'Admin accounts must sign in via the Admin Console.' };
      }
    }
  } catch (error: unknown) {
    const err = error as { digest?: string; name?: string; message?: string } | null | undefined;
    if (err?.digest?.startsWith('NEXT_REDIRECT') || err?.name === 'NEXT_REDIRECT') {
      throw error;
    }
    return { error: err?.message || 'Invalid email or password.' };
  }

  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const reqHeaders = await headers();
  await auth.api.signOut({ headers: reqHeaders });
  const cookieStore = await cookies();
  cookieStore.delete('om-flow-gate');
  redirect('/sign-in');
}

export async function sendMagicLinkAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get('email');
  if (typeof email !== 'string' || !email.includes('@')) {
    return { error: 'Please enter a valid email address.' };
  }

  const cleanEmail = email.toLowerCase().trim();
  const db = await getDb();
  const user = await db.collection('users').findOne({ email: cleanEmail })
    || await db.collection('user').findOne({ email: cleanEmail });

  if (!user || user.role === 'super_admin' || user.role === 'admin') {
    return { ok: true };
  }

  const { token } = await generateVerificationToken({
    identifier: cleanEmail,
    type: 'magiclink',
    metadata: { userId: user.id || user._id?.toString() },
    expiresInMs: 15 * 60 * 1000, // 15 mins
  });

  const link = buildAuthConfirmLink({
    type: 'magiclink',
    token,
    next: '/dashboard',
  });

  try {
    await sendMagicLinkEmail({
      email: cleanEmail,
      fullName: user.full_name || user.name || undefined,
      magicLink: link,
    });
  } catch (err) {
    console.error('Failed to send magic link email:', err);
    return { error: 'Could not send magic link email. Please try again later.' };
  }

  return { ok: true };
}
