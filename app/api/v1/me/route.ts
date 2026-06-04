import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { requireApiUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  return ok({
    id: ctx.user.id,
    email: ctx.user.email,
    role: ctx.user.role,
    home_unit_id: ctx.user.homeUnitId,
    active_unit_id: ctx.user.activeUnitId,
    is_all_units: ctx.user.isAllUnits,
    display_name: ctx.user.displayName,
    capabilities: ctx.user.capabilities.map((g) => ({ capability: g.capability, unit_id: g.unitId })),
  });
});
