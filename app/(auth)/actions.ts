'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
} from '@/lib/schemas/auth';

import { sendPasswordResetEmail, sendMagicLinkEmail } from '@/lib/email/resend';
import { buildAuthConfirmLink } from '@/lib/auth/email-links';

export type ActionState = {
  error?: string;
  ok?: boolean;
};

function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '/dashboard';
  // Only allow relative paths that start with a single '/'
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return { error: error.message };
  }

  const next = safeNextPath(formData.get('next'));
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
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
    // Do not reveal validation specifics; behave as success to not leak account existence
    return { ok: true };
  }

  const admin = createServiceClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('email', parsed.data.email)
    .maybeSingle();

  if (profile) {
    const { data: recovery, error: recoveryErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: parsed.data.email,
    });

    if (recoveryErr) {
      console.error('Error generating reset link:', recoveryErr);
      return { ok: true };
    }

    // Use hashed_token + our /auth/confirm route instead of action_link:
    // action_link returns the session in a URL fragment the server
    // can never read, stranding the user on the landing page.
    if (recovery?.properties?.hashed_token) {
      try {
        await sendPasswordResetEmail({
          email: parsed.data.email,
          fullName: profile.full_name ?? undefined,
          resetLink: buildAuthConfirmLink({
            type: 'recovery',
            hashedToken: recovery.properties.hashed_token,
            next: '/reset-password',
          }),
        });
      } catch (err) {
        console.error('Failed to send reset email via Resend:', err);
      }
    }
  }

  return { ok: true };
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: error.message };
  }

  redirect('/dashboard');
}

export async function acceptInviteAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawFullName = formData.get('fullName');
  const parsed = acceptInviteSchema.safeParse({
    password: formData.get('password'),
    fullName:
      typeof rawFullName === 'string' && rawFullName.trim().length > 0
        ? rawFullName
        : undefined,
  });
  if (!parsed.success) {
    return { error: 'Please enter a valid password (min 8 characters).' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: 'Your invite link is no longer valid. Please request a new invite.' };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: parsed.data.fullName ? { full_name: parsed.data.fullName } : undefined,
  });
  if (updateError) {
    return { error: updateError.message };
  }

  if (parsed.data.fullName) {
    const service = createServiceClient();
    await service
      .from('profiles')
      .update({ full_name: parsed.data.fullName })
      .eq('id', user.id);
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

  const admin = createServiceClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('email', email)
    .maybeSingle();

  if (!profile) {
    // Return ok: true to prevent account enumeration
    return { ok: true };
  }

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (error || !linkData?.properties?.hashed_token) {
    return { error: error?.message ?? 'Could not generate magic link.' };
  }

  try {
    await sendMagicLinkEmail({
      email,
      fullName: profile.full_name ?? undefined,
      magicLink: buildAuthConfirmLink({
        type: 'magiclink',
        hashedToken: linkData.properties.hashed_token,
        next: '/dashboard',
      }),
    });
  } catch (err) {
    console.error('Failed to send magic link email:', err);
    return { error: 'Could not send magic link email. Please try again later.' };
  }

  return { ok: true };
}
