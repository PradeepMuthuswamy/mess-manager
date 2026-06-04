import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export const config = {
  matcher: [
    // Skip Next internals + static assets + the auth callback endpoint
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|auth/callback).*)',
  ],
};

const PUBLIC_PATHS = [
  '/',
  '/sign-in',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Public paths and any /api route bypass the redirect gate; /api routes do their own auth.
  const isApi = pathname.startsWith('/api/');
  const isPublic =
    isApi ||
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PATHS.some((p) => p !== '/' && pathname.startsWith(p + '/'));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Logged-in users shouldn't see /sign-in.
  if (user && (pathname === '/sign-in' || pathname === '/forgot-password')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}
