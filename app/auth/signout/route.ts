import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { AUTH_FLOW_GATE_COOKIE } from '@/lib/auth/flow-gate';

export const dynamic = 'force-dynamic';

/** Error codes we allow to be forwarded to the sign-in page. */
const FORWARDABLE_ERRORS = new Set(['admin_console', 'invalid_link', 'ops_app']);

/**
 * Server-side sign-out endpoint. Server components can't write cookies,
 * so gates like requireUser() redirect here to terminate disallowed
 * sessions (e.g. an admin account holding a session in the ops app).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  try {
    await auth.api.signOut({ headers: req.headers });
  } catch (err) {
    console.error('Sign out error:', err);
  }

  const error = url.searchParams.get('error');
  const target = new URL('/sign-in', url.origin);
  if (error && FORWARDABLE_ERRORS.has(error)) {
    target.searchParams.set('error', error);
  }
  const res = NextResponse.redirect(target);
  res.cookies.delete(AUTH_FLOW_GATE_COOKIE);
  return res;
}
