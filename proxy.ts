import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';

export const config = {
  matcher: [
    // Skip Next internals + static assets + the auth callback/confirm/signout endpoints
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|auth/callback|auth/confirm|auth/signout).*)',
  ],
};

const PUBLIC_PATHS = [
  '/',
  '/sign-in',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await auth.api.getSession({ headers: request.headers });
  const user = session?.user;

  // Public paths and any /api route bypass the redirect gate
  const isApi = pathname.startsWith('/api/');
  const isPublic =
    isApi ||
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PATHS.some((p) => p !== '/' && pathname.startsWith(p + '/'));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    const nextTarget = pathname + request.nextUrl.search;
    url.search = '';
    url.searchParams.set('next', nextTarget);
    return NextResponse.redirect(url);
  }

  if (user) {
    // App segregation: mess-manager bounces super_admin to admin app
    const role = (user as { role?: string }).role;
    if (role === 'super_admin' || role === 'admin') {
      const adminAppUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL;
      if (adminAppUrl) {
        return NextResponse.redirect(new URL(adminAppUrl));
      }
      const url = request.nextUrl.clone();
      url.pathname = '/auth/signout';
      url.searchParams.set('error', 'admin_console');
      return NextResponse.redirect(url);
    }

    if (pathname === '/sign-in') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
