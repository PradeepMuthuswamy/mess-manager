import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, markTokenUsed } from '@/lib/auth/email-links';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

/**
 * Verifies magic-link tokens in the MongoDB verifications collection.
 * Recovery and invite links are rejected: those flows wrote credentials
 * sign-in does not read.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const nextParam = url.searchParams.get('next');

  if (!token) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', url.origin));
  }

  if (type === 'invite' || type === 'recovery') {
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', url.origin));
  }

  const { valid, verification } = await verifyAuthToken(token, type ?? undefined);
  if (!valid || !verification) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', url.origin));
  }

  const effectiveType = type || verification.type;
  if (effectiveType === 'invite' || effectiveType === 'recovery') {
    return NextResponse.redirect(new URL('/sign-in?error=invalid_link', url.origin));
  }

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

  if (effectiveType === 'magiclink') {
    await markTokenUsed(token);
    const next =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
        ? nextParam
        : '/dashboard';
    return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL('/sign-in?error=invalid_link', url.origin));
}
