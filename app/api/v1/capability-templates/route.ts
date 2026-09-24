import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiRole } from '@/lib/api/auth';
import { createTemplateSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const capability_templates = await getCollection('capability_templates');
  const data = await capability_templates
    .find({}, { projection: { id: 1, name: 1, description: 1, capabilities: 1, is_system: 1, created_at: 1, updated_at: 1, _id: 0 } })
    .sort({ name: 1 })
    .toArray();
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiRole(req, ['super_admin']);
  await checkRateLimit(req, 'write', ctx.user.id);
  const bodyText = await req.text();

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const parsed = createTemplateSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const capability_templates = await getCollection('capability_templates');
  const existing = await capability_templates.findOne({ name: parsed.data.name });
  if (existing) throw Errors.conflict('Template with that name already exists');

  const docToInsert = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    capabilities: parsed.data.capabilities as never,
    created_by: ctx.user.id,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await capability_templates.insertOne(docToInsert);
  const data = docToInsert;

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, data);
  return created(data, `/api/v1/capability-templates/${data.id}`);
});
