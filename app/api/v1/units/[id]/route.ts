import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiRole } from '@/lib/api/auth';
import { updateUnitSchema } from '@/lib/schemas';

import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const units = await getCollection('units');
  const data = await units.findOne({ id });
  if (!data) throw Errors.notFound();
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiRole(req, ['super_admin']);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateUnitSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());
  const payload = parsed.data.code
    ? { ...parsed.data, code: parsed.data.code.toUpperCase() }
    : parsed.data;
  const units = await getCollection('units');
  await units.updateOne({ id }, { $set: { ...payload, updated_at: new Date() } });
  const data = await units.findOne({ id });
  if (!data) throw Errors.notFound();
  return ok(data);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiRole(req, ['super_admin']);
  const { id } = await params;
  // Soft-delete: set is_active=false.
  const units = await getCollection('units');
  await units.updateOne({ id }, { $set: { is_active: false, updated_at: new Date() } });
  return noContent();
});
