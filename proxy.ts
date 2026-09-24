import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { AUTH_FLOW_GATE_COOKIE, isGatePath } from '@/lib/auth/flow-gate';

export const config = {
  runtime: 'nodejs',
  matcher: [
    // Skip Next internals + static assets + the auth callback/confirm/signout endpoints
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|auth/callback|auth/confirm|auth/signout).*)',
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
  const { pathname } = request.nextUrl;
  const session = await auth.api.getSession({ headers: request.headers });
  const user = session?.user;

  const response = NextResponse.next();

  // Confinement for partially-trusted sessions created by recovery/invite email links
  const gate = request.cookies.get(AUTH_FLOW_GATE_COOKIE)?.value;
  if (gate && isGatePath(gate)) {
    if (user && pathname !== gate && pathname !== '/mfa/verify' && pathname !== '/mfa/enroll') {
      const url = request.nextUrl.clone();
      url.pathname = gate;
      url.search = '';
      return NextResponse.redirect(url);
    }
    if (!user) {
      response.cookies.delete(AUTH_FLOW_GATE_COOKIE);
    }
  }

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

    // Logged-in users shouldn't see /sign-in or /forgot-password
    if (pathname === '/sign-in' || pathname === '/forgot-password') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
