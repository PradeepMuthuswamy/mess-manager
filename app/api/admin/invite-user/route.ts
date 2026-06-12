import { NextRequest } from 'next/server';
import { withRoute, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { inviteUserSchema } from '@/lib/schemas';
import { userHasCapability } from '@/lib/auth/capabilities';
import type { AuthUser, Capability, Role } from '@/lib/auth/types';
import type { Database } from '@/lib/supabase/database.types';
import { sendInvitationEmail } from '@/lib/email/resend';
import { buildAuthConfirmLink } from '@/lib/auth/email-links';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function currentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase.from('profiles').select('id, email, full_name, role, unit_id, display_name').eq('id', user.id).single();
  if (!p) return null;
  const { data: caps } = await supabase.from('user_capabilities').select('capability, unit_id').eq('user_id', user.id);
  return {
    id: p.id,
    email: p.email ?? user.email ?? '',
    role: p.role as Role,
    homeUnitId: p.unit_id,
    activeUnitId: p.unit_id,
    isAllUnits: false,
    displayName: p.display_name ?? null,
    capabilities: (caps ?? []).map((c) => ({ capability: c.capability as never, unitId: c.unit_id })),
  };
}

export const POST = withRoute(async (req: NextRequest) => {
  const user = await currentUser();
  if (!user) throw Errors.unauthenticated();
  if (!userHasCapability(user, 'users.invite')) throw Errors.forbidden();

  const body = await req.json().catch(() => null);
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  let mappedRole = parsed.data.role;
  if ((mappedRole as string) === 'admin') {
    mappedRole = 'super_admin';
  }

  if ((user.role as string) !== 'admin' && (user.role as string) !== 'super_admin') {
    if ((mappedRole as string) === 'admin' || (mappedRole as string) === 'super_admin' || (mappedRole as string) === 'unit_admin') throw Errors.forbidden();
    if (parsed.data.unit_id && parsed.data.unit_id !== user.homeUnitId) throw Errors.forbidden();
  }
  const targetUnit = parsed.data.unit_id ?? (((user.role as string) === 'unit_admin' || (user.role as string) === 'mess_secretary') ? user.homeUnitId : null);

  const admin = createServiceClient();
  const { data: invited, error: invErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: parsed.data.email,
    options: {
      data: {
        ...(parsed.data.full_name ? { full_name: parsed.data.full_name } : {}),
        role: mappedRole,
        unit_id: targetUnit,
      },
    },
  });
  if (invErr || !invited?.user || !invited?.properties?.hashed_token) {
    throw Errors.conflict(invErr?.message ?? 'Could not invite');
  }

  await admin.from('profiles').update({
    role: mappedRole as Database['public']['Enums']['user_role'],
    unit_id: targetUnit,
    ...(parsed.data.full_name ? { full_name: parsed.data.full_name } : {}),
  }).eq('id', invited.user.id);

  // Get unit name for custom invite email
  let unitName = 'Officers\' Mess';
  if (targetUnit) {
    const { data: unitData } = await admin.from('units').select('name').eq('id', targetUnit).maybeSingle();
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
      role: mappedRole,
    });
  } catch (err) {
    console.error('Failed to send invitation email via Resend in Admin API:', err);
  }

  if (parsed.data.capability_template_id) {
    const { data: tpl } = await admin.from('capability_templates').select('capabilities').eq('id', parsed.data.capability_template_id).single();
    if (tpl) {
      const rows = (tpl.capabilities as Capability[]).map((c) => ({ user_id: invited.user!.id, capability: c, unit_id: targetUnit as string }));
      if (rows.length) await admin.from('user_capabilities').upsert(rows);
    }
  }
  if (parsed.data.capabilities?.length) {
    const rows = parsed.data.capabilities.map((c) => ({ user_id: invited.user!.id, capability: c as Capability, unit_id: targetUnit as string }));
    await admin.from('user_capabilities').upsert(rows);
  }

  return created({ id: invited.user.id, email: invited.user.email });
});
