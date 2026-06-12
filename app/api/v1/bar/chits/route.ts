import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { createBarChitSchema, listBarChitsQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { createBarChitCore } from '@/lib/bar/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = listBarChitsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  let unitId: string | null;
  if (ctx.user.role === 'admin') {
    unitId = parsed.data.unit_id ?? ctx.user.activeUnitId ?? null;
  } else {
    unitId = ctx.user.activeUnitId;
    if (parsed.data.unit_id && parsed.data.unit_id !== unitId) {
      await requireApiCapability(req, 'bar.read', parsed.data.unit_id);
      unitId = parsed.data.unit_id;
    }
  }

  if (unitId === null) {
    return ok({ data: [] });
  }

  // Capability check
  if (ctx.user.role !== 'admin') {
    await requireApiCapability(req, 'bar.read', unitId);
  }

  const { data, error } = await ctx.supabase
    .from('bar_chits')
    .select(`
      *,
      profile:profile_id (id, full_name, email, rank, service_no),
      booking:booking_id (
        id,
        guest_name,
        room:room_id (name)
      ),
      items:bar_chit_items (
        *,
        variant:variant_id (
          id,
          unit_value,
          unit_type,
          package_type,
          product:product_id (name)
        )
      )
    `)
    .eq('unit_id', unitId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit);

  if (error) throw Errors.internal(error.message);

  return ok({ data });
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = createBarChitSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const { unit_id } = parsed.data;

  // Capability gate
  const ctx = await requireApiCapability(req, 'bar.write', unit_id);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const res = await createBarChitCore(ctx.supabase, ctx.user.id, parsed.data);
  if ('error' in res && res.error) {
    throw Errors.badRequest(res.error);
  }

  const chitId = res.id!;
  
  // Fetch full details of the newly created chit for response
  const { data: chitRow, error: fetchErr } = await ctx.supabase
    .from('bar_chits')
    .select(`
      *,
      profile:profile_id (id, full_name, email, rank, service_no),
      booking:booking_id (
        id,
        guest_name,
        room:room_id (name)
      ),
      items:bar_chit_items (
        *,
        variant:variant_id (
          id,
          unit_value,
          unit_type,
          package_type,
          product:product_id (name)
        )
      )
    `)
    .eq('id', chitId)
    .single();

  if (fetchErr || !chitRow) {
    throw Errors.internal(fetchErr?.message ?? 'Chit created but retrieval failed');
  }

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, chitRow);
  return created(chitRow, `/api/v1/bar/chits/${chitId}`);
});
