import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, markTokenUsed } from '@/lib/auth/email-links';
import {
  AUTH_FLOW_GATE_COOKIE,
  AUTH_FLOW_GATE_MAX_AGE,
} from '@/lib/auth/flow-gate';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

/**
 * Verifies email-link tokens (recovery, invite, magic link) in MongoDB verifications
 * collection, then forwards to the target action page (/accept-invite or /reset-password).
 *
 * App segregation: super_admin accounts belong in the Admin Console.
 *
 * Flow-gate: sets om-flow-gate cookie to confine the session to the reset/accept page.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const nextParam = url.searchParams.get('next');

  if (!token) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', url.origin));
  }

  // Verify token in MongoDB verifications collection
  const { valid, verification } = await verifyAuthToken(token, type ?? undefined);
  if (!valid || !verification) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', url.origin));
  }

  const effectiveType = type || verification.type;

  // App segregation: super_admin / admin accounts belong in Admin Console
  const usersCol = await getCollection('users');
  const user = await usersCol.findOne({
    $or: [
      { email: verification.identifier },
      ...(verification.metadata?.userId ? [{ id: verification.metadata.userId }] : []),
    ],
  });

  const role = user?.role ?? verification.metadata?.role;
  if (role && (role === 'super_admin' || role === 'admin')) {
    return NextResponse.redirect(new URL('/sign-in?error=admin_console', url.origin));
  }

  let redirectPath: string;
  let gatePath: string | null = null;

  if (effectiveType === 'invite') {
    redirectPath = `/accept-invite?token=${encodeURIComponent(token)}`;
    gatePath = '/accept-invite';
  } else if (effectiveType === 'recovery') {
    redirectPath = `/reset-password?token=${encodeURIComponent(token)}`;
    gatePath = '/reset-password';
  } else if (effectiveType === 'magiclink') {
    await markTokenUsed(token);
    const next =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
        ? nextParam
        : '/dashboard';
    redirectPath = next;
  } else {
    redirectPath = '/dashboard';
  }

  const res = NextResponse.redirect(new URL(redirectPath, url.origin));
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
