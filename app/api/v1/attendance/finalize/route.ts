import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiCapability } from '@/lib/api/auth';
import { finalizeAttendanceSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getAttendanceDay } from '@/lib/attendance/queries';
import { applyFinalize } from '@/lib/attendance/save-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = finalizeAttendanceSchema.safeParse(
    JSON.parse(bodyText || 'null'),
  );
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiCapability(
    req,
    'attendance.finalize',
    parsed.data.unit_id,
  );
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const res = await applyFinalize(ctx.supabase, ctx.user.id, parsed.data);
  if ('error' in res) throw Errors.badRequest(res.error);

  const data = await getAttendanceDay(
    parsed.data.unit_id,
    parsed.data.attendance_date,
    ctx.supabase,
  );
  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 200, data);
  return ok({ data });
});
