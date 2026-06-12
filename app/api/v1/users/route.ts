import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { inviteUserSchema, listUsersQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { sendInvitationEmail } from '@/lib/email/resend';
import { buildAuthConfirmLink } from '@/lib/auth/email-links';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const url = new URL(req.url);
  const parsed = listUsersQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const wantUnit = ctx.user.role === 'unit_admin' ? ctx.user.homeUnitId : parsed.data.unit_id ?? null;
  let q = ctx.supabase.from('profiles')
    .select('id, email, full_name, role, unit_id, is_active, rank, service_no, display_name, created_at, updated_at')
    .order('full_name', { ascending: true })
    .limit(parsed.data.limit);
  if (parsed.data.active_only) q = q.eq('is_active', true);
  if (parsed.data.role) {
    q = q.eq('role', parsed.data.role);
  }
  if (wantUnit) q = q.eq('unit_id', wantUnit);
  if (parsed.data.q) q = q.ilike('full_name', `%${parsed.data.q}%`);

  const { data, error } = await q;
  if (error) throw Errors.internal(error.message);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);
  const bodyText = await req.text();
  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }
  const parsed = inviteUserSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const targetUnit = parsed.data.unit_id ?? (ctx.user.role === 'unit_admin' ? ctx.user.homeUnitId : null);

  const { data: invited, error: invErr } = await ctx.admin.auth.admin.generateLink({
    type: 'invite',
    email: parsed.data.email,
    options: {
      data: {
        ...(parsed.data.full_name ? { full_name: parsed.data.full_name } : {}),
        role: parsed.data.role,
        unit_id: targetUnit,
      },
    },
  });
  if (invErr || !invited?.user || !invited?.properties?.hashed_token) {
    throw Errors.conflict(invErr?.message ?? 'Could not invite');
  }

  await ctx.admin.from('profiles').update({
    role: parsed.data.role,
    unit_id: targetUnit,
    ...(parsed.data.full_name ? { full_name: parsed.data.full_name } : {}),
  }).eq('id', invited.user.id);

  // Get unit name for custom invite email
  let unitName = 'Officers\' Mess';
  if (targetUnit) {
    const { data: unitData } = await ctx.admin.from('units').select('name').eq('id', targetUnit).maybeSingle();
    if (unitData?.name) unitName = unitData.name;
  }

  try {
    await sendInvitationEmail({
      email: parsed.data.email,
      fullName: parsed.data.full_name || undefined,
      inviteLink: buildAuthConfirmLink({
        type: 'invite',
        hashedToken: invited.properties.hashed_token,
        next: '/accept-invite',
      }),
      unitName,
      role: parsed.data.role,
    });
  } catch (err) {
    console.error('Failed to send invitation email via Resend in API:', err);
  }

  // Apply capability template if provided
  if (parsed.data.capability_template_id && targetUnit) {
    const { data: tpl } = await ctx.admin
      .from('capability_templates')
      .select('capabilities')
      .eq('id', parsed.data.capability_template_id)
      .single();
    if (tpl) {
      const rows = (tpl.capabilities as string[]).map((c) => ({
        user_id: invited.user!.id,
        capability: c as never,
        unit_id: targetUnit,
      }));
      if (rows.length) await ctx.admin.from('user_capabilities').upsert(rows);
    }
  }
  // Apply explicit capabilities[] if provided
  if (parsed.data.capabilities && parsed.data.capabilities.length && targetUnit) {
    const rows = parsed.data.capabilities.map((c) => ({
      user_id: invited.user!.id,
      capability: c as never,
      unit_id: targetUnit,
    }));
    await ctx.admin.from('user_capabilities').upsert(rows);
  }

  const body = { id: invited.user.id, email: invited.user.email };
  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, body);
  return created(body, `/api/v1/users/${invited.user.id}`);
});
