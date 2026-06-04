import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiRole } from '@/lib/api/auth';
import { createTemplateSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const { data, error } = await ctx.supabase
    .from('capability_templates')
    .select('id, name, description, capabilities, is_system, created_at, updated_at')
    .order('name', { ascending: true });
  if (error) throw Errors.internal(error.message);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiRole(req, ['admin']);
  await checkRateLimit(req, 'write', ctx.user.id);
  const bodyText = await req.text();

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const parsed = createTemplateSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const { data, error } = await ctx.admin
    .from('capability_templates')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      capabilities: parsed.data.capabilities as never,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error?.code === '23505') throw Errors.conflict('Template with that name already exists');
  if (error) throw Errors.internal(error.message);

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, data);
  return created(data, `/api/v1/capability-templates/${data.id}`);
});
