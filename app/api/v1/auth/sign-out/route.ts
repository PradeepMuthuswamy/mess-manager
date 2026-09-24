import { NextRequest } from 'next/server';
import { withRoute, noContent } from '@/lib/api/handler';
import { requireApiUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  return noContent();
});
