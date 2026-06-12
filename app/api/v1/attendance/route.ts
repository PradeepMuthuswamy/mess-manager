import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { listAttendanceQuerySchema, saveAttendanceSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getAttendanceDay } from '@/lib/attendance/queries';
import { applyAttendanceSave } from '@/lib/attendance/save-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = listAttendanceQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const { unit_id, attendance_date } = parsed.data;

  const data = await getAttendanceDay(unit_id, attendance_date, ctx.supabase);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const PUT = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = saveAttendanceSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const res = await applyAttendanceSave(ctx.supabase, ctx.user.id, parsed.data);
  if ('error' in res) throw Errors.badRequest(res.error);

  const data = await getAttendanceDay(
    parsed.data.unit_id,
    parsed.data.attendance_date,
    ctx.supabase,
  );
  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 200, data);
  return ok({ data });
});
