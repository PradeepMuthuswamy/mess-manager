import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  AUTH_FLOW_GATE_COOKIE,
  AUTH_FLOW_GATE_MAX_AGE,
} from '@/lib/auth/flow-gate';

export const dynamic = 'force-dynamic';

const VALID_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

/**
 * Verifies email-link tokens (recovery, invite, magic link, signup,
 * email change) server-side via verifyOtp, so the session lands in
 * SSR cookies instead of a URL fragment, then forwards to `next`.
 *
 * Two extra gates:
 * - This is the user (ops) app: `admin` accounts may not establish a
 *   session here — they belong in the Admin Console.
 * - Recovery/invite sessions are only partially trusted: a flow-gate
 *   cookie confines them (via proxy.ts) to the reset/accept page until
 *   the flow completes.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const nextParam = url.searchParams.get('next') ?? '/dashboard';
  const next =
    nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/dashboard';

  if (tokenHash && type && VALID_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // App segregation: admin accounts must use the Admin Console.
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (profile?.role === 'admin') {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            new URL('/sign-in?error=admin_console', url.origin)
          );
        }
      }

      const res = NextResponse.redirect(new URL(next, url.origin));
      const gatePath =
        type === 'recovery'
          ? '/reset-password'
          : type === 'invite'
            ? '/accept-invite'
            : null;
      if (gatePath) {
        res.cookies.set(AUTH_FLOW_GATE_COOKIE, gatePath, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: AUTH_FLOW_GATE_MAX_AGE,
        });
      }
      return res;
    }
  }

  return NextResponse.redirect(
    new URL('/sign-in?error=invalid_link', url.origin)
  );
}
