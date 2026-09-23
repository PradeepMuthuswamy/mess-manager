import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { forgotPasswordSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { createServiceClient } from '@/lib/supabase/service';
import { sendPasswordResetEmail } from '@/lib/email/resend';
import { issueAuthConfirmLink } from '@/lib/auth/email-links';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withRoute(async (req: NextRequest) => {
  await checkRateLimit(req, 'auth');
  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  // Service role is needed for generateLink; this endpoint never reveals
  // whether the account exists, and only ever emails the account owner.
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('email', parsed.data.email)
    .maybeSingle();

  // Admin accounts reset their password via the Admin Console; respond
  // identically either way to avoid account enumeration.
  if (profile && profile.role !== 'super_admin') {
    const recovery = await issueAuthConfirmLink(admin, {
      type: 'recovery',
      email: parsed.data.email,
      next: '/reset-password',
    });

    if (!recovery.error && recovery.link) {
      try {
        await sendPasswordResetEmail({
          email: parsed.data.email,
          fullName: profile.full_name ?? undefined,
          resetLink: recovery.link,
        });
      } catch (err) {
        console.error('Failed to send reset email via Resend (API):', err);
      }
    }
  }

  // Always succeed to prevent account enumeration.
  return ok({ ok: true });
});
