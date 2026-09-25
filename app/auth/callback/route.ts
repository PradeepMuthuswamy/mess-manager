import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const nextParam = url.searchParams.get('next') ?? '/dashboard';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/dashboard';
  return NextResponse.redirect(new URL(next, url.origin));
}
