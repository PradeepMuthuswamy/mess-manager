import { withRoute } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async () => {
  throw Errors.notFound('Pricing history and time-versioning are obsolete.');
});

export const POST = withRoute(async () => {
  throw Errors.notFound('Pricing history and time-versioning are obsolete.');
});
