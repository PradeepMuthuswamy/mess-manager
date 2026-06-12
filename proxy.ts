import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { AUTH_FLOW_GATE_COOKIE, isGatePath } from '@/lib/auth/flow-gate';

export const config = {
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
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Confinement for partially-trusted sessions created by recovery/invite
  // email links: until the flow completes (which clears the gate cookie),
  // the session may only reach its own flow page. Without this, a failed
  // or abandoned password reset leaves a fully usable session behind.
  const gate = request.cookies.get(AUTH_FLOW_GATE_COOKIE)?.value;
  if (gate && isGatePath(gate)) {
    if (user && pathname !== gate) {
      const url = request.nextUrl.clone();
      url.pathname = gate;
      url.search = '';
      return NextResponse.redirect(url);
    }
    if (!user) {
      // Session is gone; the stale gate cookie would otherwise trap the
      // next sign-in. Drop it.
      response.cookies.delete(AUTH_FLOW_GATE_COOKIE);
    }
  }

  // Public paths and any /api route bypass the redirect gate; /api routes do their own auth.
  const isApi = pathname.startsWith('/api/');
  const isPublic =
    isApi ||
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PATHS.some((p) => p !== '/' && pathname.startsWith(p + '/'));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    // Preserve the full original destination (path + query) so post-login
    // deep links like /masters?cat=alcohol resolve to the right module.
    // Reset search first — clone() carried the original query params over.
    const nextTarget = pathname + request.nextUrl.search;
    url.search = '';
    url.searchParams.set('next', nextTarget);
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
