import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { userHasCapability } from '@/lib/auth/capabilities';
import { getRooms } from '@/lib/guest-rooms/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const roomsQuerySchema = z.object({
  unit_id: z.string().uuid(),
});

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = roomsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const { unit_id } = parsed.data;
  if (!userHasCapability(ctx.user, 'rooms.read', unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.read');
  }

  const data = await getRooms(unit_id, ctx.supabase);
  return ok({ data });
});
