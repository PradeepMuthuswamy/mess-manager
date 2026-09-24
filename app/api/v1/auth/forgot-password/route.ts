import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { forgotPasswordSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { sendPasswordResetEmail } from '@/lib/email/resend';
import { generateVerificationToken, buildAuthConfirmLink } from '@/lib/auth/email-links';
import { inviteLinkBaseUrl } from '@/lib/auth/invite-destination';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withRoute(async (req: NextRequest) => {
  await checkRateLimit(req, 'auth');
  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const email = parsed.data.email.toLowerCase().trim();
  const usersCol = await getCollection('users');
  const user = await usersCol.findOne({ email });

  // super_admin and unit_admin reset here. mess_secretary opens mess-manager.
  // user/manager reset in that app. We always return ok below, so this
  // never reveals account existence.
  if (
    user &&
    (user.role === 'super_admin' ||
      user.role === 'admin' ||
      user.role === 'unit_admin' ||
      user.role === 'mess_secretary')
  ) {
    const destination = inviteLinkBaseUrl(user.role, process.env.NEXT_PUBLIC_OPS_APP_URL);
    if (!('error' in destination)) {
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
        baseUrl: destination.baseUrl,
      });

      try {
        await sendPasswordResetEmail({
          email,
          fullName: user.full_name || user.name || undefined,
          resetLink,
        });
      } catch (err) {
        console.error('Failed to send reset email via Resend (API):', err);
      }
    } else {
      console.error(destination.error);
    }
  }

  // Always succeed to prevent account enumeration.
  return ok({ ok: true });
});
