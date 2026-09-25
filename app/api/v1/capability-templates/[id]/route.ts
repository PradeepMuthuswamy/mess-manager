import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiRole } from '@/lib/api/auth';
import { updateTemplateSchema } from '@/lib/schemas';
import { getDb } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import type { CapabilityTemplateDoc } from '@/lib/users/types';
import type { Capability } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  await requireApiUser(req);
  const { id } = await params;

  const db = await getDb();
  const tpl = await db.collection<CapabilityTemplateDoc>('capability_templates').findOne({ id });
  if (!tpl) throw Errors.notFound();

  const clean = { ...tpl };
  delete (clean as Record<string, unknown>)._id;
  return ok(clean);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiRole(req, ['super_admin']);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const db = await getDb();
  const col = db.collection<CapabilityTemplateDoc>('capability_templates');
  const existing = await col.findOne({ id });
  if (!existing) throw Errors.notFound();

  if (parsed.data.name && parsed.data.name !== existing.name) {
    const dup = await col.findOne({ name: parsed.data.name });
    if (dup) throw Errors.conflict('Template with that name already exists');
  }

  const now = new Date().toISOString();
  const update: Partial<CapabilityTemplateDoc> = {
    updated_at: now,
    updated_by: ctx.user.id,
  };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.capabilities !== undefined) {
    update.capabilities = parsed.data.capabilities as Capability[];
  }

  await col.updateOne({ id }, { $set: update });

  const cleanExisting = { ...existing };
  delete (cleanExisting as Record<string, unknown>)._id;
  const updated: CapabilityTemplateDoc = { ...cleanExisting, ...update };

  await writeAudit({
    table_name: 'capability_templates',
    row_pk: id,
    op: 'UPDATE',
    changed_by: ctx.user.id,
    old_data: existing as never,
    new_data: updated as never,
  });

  return ok(updated);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiRole(req, ['super_admin']);
  const { id } = await params;

  const db = await getDb();
  const col = db.collection<CapabilityTemplateDoc>('capability_templates');
  const existing = await col.findOne({ id });
  if (!existing) throw Errors.notFound();
  if (existing.is_system) throw Errors.forbidden('Cannot delete system templates');

  await col.deleteOne({ id });

  await writeAudit({
    table_name: 'capability_templates',
    row_pk: id,
    op: 'DELETE',
    changed_by: ctx.user.id,
    old_data: existing as never,
  });

  return noContent();
});
