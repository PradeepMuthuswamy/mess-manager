'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { hashPassword } from 'better-auth/crypto';
import { auth } from '@/lib/auth/auth';
import { AUTH_FLOW_GATE_COOKIE } from '@/lib/auth/flow-gate';
import {
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
} from '@/lib/schemas/auth';
import { sendPasswordResetEmail, sendMagicLinkEmail } from '@/lib/email/resend';
import {
  generateVerificationToken,
  buildAuthConfirmLink,
  verifyAuthToken,
  markTokenUsed,
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

    if (res && 'twoFactorRedirect' in res && (res as Record<string, unknown>).twoFactorRedirect) {
      redirect(`/mfa/verify?next=${encodeURIComponent(next)}`);
    }

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
    if (error?.digest?.startsWith('NEXT_REDIRECT') || error?.name === 'NEXT_REDIRECT') {
      throw error;
    }
    return { error: error.message || 'Invalid email or password.' };
  }

  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const reqHeaders = await headers();
  await auth.api.signOut({ headers: reqHeaders });
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_FLOW_GATE_COOKIE);
  redirect('/sign-in');
}

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { ok: true };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const db = await getDb();
  const user = await db.collection('users').findOne({ email })
    || await db.collection('user').findOne({ email });

  if (user && user.role !== 'super_admin' && user.role !== 'admin') {
    const { token } = await generateVerificationToken({
      identifier: email,
      type: 'recovery',
      metadata: { userId: user.id || user._id?.toString() },
      expiresInMs: 60 * 60 * 1000, // 1 hour
    });

    const resetLink = buildAuthConfirmLink({
      type: 'recovery',
      token,
      next: '/reset-password',
    });

    try {
      await sendPasswordResetEmail({
        email,
        fullName: user.full_name || user.name || undefined,
        resetLink,
      });
    } catch (err) {
      console.error('Failed to send reset email via Resend:', err);
    }
  }

  return { ok: true };
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = formData.get('token');
  const password = formData.get('password');

  if (typeof token !== 'string' || !token) {
    (await cookies()).delete(AUTH_FLOW_GATE_COOKIE);
    redirect('/sign-in?error=invalid_link');
  }

  const parsed = resetPasswordSchema.safeParse({ password });
  if (!parsed.success) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const { valid, verification } = await verifyAuthToken(token, 'recovery');
  if (!valid || !verification) {
    (await cookies()).delete(AUTH_FLOW_GATE_COOKIE);
    redirect('/sign-in?error=invalid_link');
  }

  try {
    const hashedPassword = await hashPassword(parsed.data.password);
    const db = await getDb();
    const email = verification.identifier.toLowerCase();

    // Update users collection
    await db.collection('users').updateOne(
      {
        $or: [
          { email },
          ...(verification.metadata?.userId ? [{ id: verification.metadata.userId }] : []),
        ],
      },
      {
        $set: {
          password: hashedPassword,
          status: 'active',
          updatedAt: new Date(),
        },
      }
    );

    // Update or create credential in account collection for Better Auth
    const userDoc = await db.collection('users').findOne({ email })
      || await db.collection('user').findOne({ email });

    const userId = userDoc?._id?.toString() || userDoc?.id || verification.metadata?.userId;
    if (userId) {
      await db.collection('account').updateOne(
        { providerId: 'credential', accountId: userId },
        {
          $set: {
            password: hashedPassword,
            userId,
            providerId: 'credential',
            accountId: userId,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    await markTokenUsed(token);
    const cookieStore = await cookies();
    cookieStore.delete(AUTH_FLOW_GATE_COOKIE);
  } catch (err) {
    console.error('Password reset update error:', err);
    redirect('/sign-in?error=reset_failed');
  }

  redirect('/sign-in?message=password_updated');
}

export async function acceptInviteAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = formData.get('token');
  const rawFullName = formData.get('fullName');
  const password = formData.get('password');

  if (typeof token !== 'string' || !token) {
    (await cookies()).delete(AUTH_FLOW_GATE_COOKIE);
    redirect('/sign-in?error=invalid_link');
  }

  const parsed = acceptInviteSchema.safeParse({
    password,
    fullName: typeof rawFullName === 'string' && rawFullName.trim().length > 0 ? rawFullName : undefined,
  });

  if (!parsed.success) {
    return { error: 'Please enter a valid password (min 8 characters).' };
  }

  const { valid, verification } = await verifyAuthToken(token, 'invite');
  if (!valid || !verification) {
    (await cookies()).delete(AUTH_FLOW_GATE_COOKIE);
    redirect('/sign-in?error=invalid_link');
  }

  try {
    const hashedPassword = await hashPassword(parsed.data.password);
    const db = await getDb();
    const email = verification.identifier.toLowerCase();

    const updateFields: Record<string, unknown> = {
      password: hashedPassword,
      status: 'active',
      updatedAt: new Date(),
    };
    if (parsed.data.fullName) {
      updateFields.full_name = parsed.data.fullName;
      updateFields.name = parsed.data.fullName;
    }

    await db.collection('users').updateOne(
      {
        $or: [
          { email },
          ...(verification.metadata?.userId ? [{ id: verification.metadata.userId }] : []),
        ],
      },
      { $set: updateFields }
    );

    const userDoc = await db.collection('users').findOne({ email })
      || await db.collection('user').findOne({ email });

    const userId = userDoc?._id?.toString() || userDoc?.id || verification.metadata?.userId;
    if (userId) {
      await db.collection('account').updateOne(
        { providerId: 'credential', accountId: userId },
        {
          $set: {
            password: hashedPassword,
            userId,
            providerId: 'credential',
            accountId: userId,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    await markTokenUsed(token);
    const cookieStore = await cookies();
    cookieStore.delete(AUTH_FLOW_GATE_COOKIE);
  } catch (err) {
    console.error('Accept invite error:', err);
    return { error: 'Failed to accept invite.' };
  }

  redirect('/dashboard');
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
