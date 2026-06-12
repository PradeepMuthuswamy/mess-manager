'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import type { Role, Capability } from '@/lib/auth/types';
import { sendInvitationEmail } from '@/lib/email/resend';
import { buildAuthConfirmLink } from '@/lib/auth/email-links';

const USERS_PATH = '/users';

export async function fetchUnitUsersAction(unitId?: string | null) {
  const caller = await requireUser();
  
  // Resolve target unit: unit_admin and mess_secretary are locked to their homeUnitId
  const targetUnit = (caller.role === 'unit_admin' || caller.role === 'mess_secretary') ? caller.homeUnitId : unitId ?? caller.activeUnitId;
  
  await requireCapability('users.read', targetUnit);

  const supabase = await createClient();
  let q = supabase
    .from('profiles')
    .select('id, email, full_name, role, unit_id, is_active, rank, service_no, display_name, created_at, updated_at, user_capabilities(capability, unit_id)')
    .order('full_name', { ascending: true });

  if (targetUnit) {
    q = q.eq('unit_id', targetUnit);
  }

  const { data, error } = await q;
  if (error) return { error: error.message };

  return { ok: true, data };
}

export async function fetchCapabilityTemplatesAction() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('capability_templates')
    .select('id, name, description, capabilities, is_system, created_at, updated_at')
    .order('name', { ascending: true });

  if (error) return { error: error.message };
  return { ok: true, data };
}

export async function inviteUserAction(input: {
  email: string;
  full_name?: string;
  unit_id?: string | null;
  role: Role;
  capability_template_id?: string;
  capabilities?: string[];
}) {
  const caller = await requireUser();
  await requireCapability('users.invite', input.unit_id);

  let targetRole: any = input.role;
  if ((targetRole as string) === 'admin') {
    targetRole = 'super_admin';
  }

  // Authorization checks for role & unit scoping
  if (caller.role !== 'super_admin') {
    if (targetRole === 'super_admin' || targetRole === 'unit_admin') {
      return { error: 'Only super admin may grant super_admin or unit_admin roles.' };
    }
    if (caller.role === 'unit_admin') {
      if (input.unit_id && input.unit_id !== caller.homeUnitId) {
        return { error: 'Cannot invite users into other units.' };
      }
    }
  }

  const targetUnit = input.unit_id ?? (caller.role === 'unit_admin' ? caller.homeUnitId : null);

  const admin = createServiceClient();
  const { data: invited, error: invErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: input.email,
    options: {
      data: {
        ...(input.full_name ? { full_name: input.full_name } : {}),
        role: targetRole,
        unit_id: targetUnit,
      },
    },
  });

  if (invErr || !invited?.user || !invited?.properties?.hashed_token) {
    return { error: invErr?.message ?? 'Could not trigger invitation.' };
  }

  // Update profile with specific details
  const { error: profErr } = await admin.from('profiles').update({
    role: targetRole,
    unit_id: targetUnit,
    ...(input.full_name ? { full_name: input.full_name } : {}),
  }).eq('id', invited.user.id);

  if (profErr) {
    return { error: profErr.message };
  }

  // Get unit name for custom invite email
  let unitName = 'Officers\' Mess';
  if (targetUnit) {
    const { data: unitData } = await admin.from('units').select('name').eq('id', targetUnit).maybeSingle();
    if (unitData?.name) unitName = unitData.name;
  }

  try {
    await sendInvitationEmail({
      email: input.email,
      fullName: input.full_name,
      inviteLink: buildAuthConfirmLink({
        type: 'invite',
        hashedToken: invited.properties.hashed_token,
        next: '/accept-invite',
      }),
      unitName,
      role: targetRole,
    });
  } catch (err) {
    console.error('Failed to send invitation email via Resend:', err);
    // Do not return error since profile and user were successfully provisioned in DB
  }

  // Provision capabilities if template is provided
  if (input.capability_template_id && targetUnit) {
    const { data: tpl } = await admin
      .from('capability_templates')
      .select('capabilities')
      .eq('id', input.capability_template_id)
      .single();
    if (tpl) {
      const rows = (tpl.capabilities as string[]).map((c) => ({
        user_id: invited.user!.id,
        capability: c as never,
        unit_id: targetUnit,
      }));
      if (rows.length) await admin.from('user_capabilities').upsert(rows);
    }
  }

  // Provision explicit capabilities if provided
  if (input.capabilities && input.capabilities.length && targetUnit) {
    const rows = input.capabilities.map((c) => ({
      user_id: invited.user!.id,
      capability: c as never,
      unit_id: targetUnit,
    }));
    await admin.from('user_capabilities').upsert(rows);
  }

  revalidatePath(USERS_PATH);
  return { ok: true, data: { id: invited.user.id, email: invited.user.email } };
}

export async function updateUserAction(
  userId: string,
  input: {
    full_name?: string;
    service_no?: string;
    rank?: string;
    role?: Role;
    unit_id?: string | null;
  }
) {
  const caller = await requireUser();
  
  if (userId === caller.id) {
    return { error: 'You cannot edit your own account details from here.' };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('unit_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (!target) return { error: 'User not found.' };

  await requireCapability('users.manage', target.unit_id);

  // Role/unit changes only by super_admin
  const wantsRoleChange = input.role !== undefined;
  const wantsUnitChange = input.unit_id !== undefined;
  if ((wantsRoleChange || wantsUnitChange) && caller.role !== 'super_admin') {
    return { error: 'Only super admin may change user roles or units.' };
  }

  if ((caller.role === 'unit_admin' || caller.role === 'mess_secretary') && target.unit_id !== caller.homeUnitId) {
    return { error: 'You can only edit users within your own unit.' };
  }

  let mappedRole: any = input.role;
  if (mappedRole === 'admin') {
    mappedRole = 'super_admin';
  }

  if (mappedRole !== undefined || input.unit_id !== undefined) {
    const finalRole = mappedRole !== undefined ? mappedRole : target.role;
    const finalUnitId = input.unit_id !== undefined ? input.unit_id : target.unit_id;
    if (finalRole !== 'super_admin' && !finalUnitId) {
      return { error: 'A unit must be specified for non-admin users.' };
    }
  }

  // Update profile
  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from('profiles')
    .update({
      ...(input.full_name !== undefined ? { full_name: input.full_name || null } : {}),
      ...(input.service_no !== undefined ? { service_no: input.service_no || null } : {}),
      ...(input.rank !== undefined ? { rank: input.rank || null } : {}),
      ...(mappedRole !== undefined ? { role: mappedRole } : {}),
      ...(input.unit_id !== undefined ? { unit_id: input.unit_id } : {}),
    })
    .eq('id', userId);

  if (updateErr) return { error: updateErr.message };

  // Sync auth user app_metadata if role or unit changes
  if (mappedRole !== undefined || input.unit_id !== undefined) {
    const updateData: any = {};
    if (mappedRole !== undefined) {
      updateData.role = mappedRole;
    }
    if (input.unit_id !== undefined) {
      updateData.unit_id = input.unit_id;
    }
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: updateData
    });
  }

  revalidatePath(USERS_PATH);
  return { ok: true };
}

export async function updateUserCapabilitiesAction(
  userId: string,
  capabilities: { capability: Capability; unitId: string }[]
) {
  const caller = await requireUser();
  if (userId === caller.id) {
    return { error: 'You cannot edit your own capability permissions.' };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('unit_id')
    .eq('id', userId)
    .maybeSingle();

  if (!target) return { error: 'User not found.' };

  await requireCapability('users.manage', target.unit_id);

  if (caller.role === 'unit_admin' || caller.role === 'mess_secretary') {
    if (target.unit_id !== caller.homeUnitId) {
      return { error: 'You can only manage users within your own unit.' };
    }
    // Check that unit_admin or mess_secretary is only granting capabilities scoped to their home unit
    for (const cap of capabilities) {
      if (cap.unitId && cap.unitId !== caller.homeUnitId) {
        return { error: 'Cannot grant capabilities outside your own unit.' };
      }
    }
  }

  const admin = createServiceClient();
  
  // Replace: delete then insert
  const { error: delErr } = await admin
    .from('user_capabilities')
    .delete()
    .eq('user_id', userId);

  if (delErr) return { error: delErr.message };

  if (capabilities.length) {
    const rows = capabilities.map((c) => ({
      user_id: userId,
      capability: c.capability as never,
      unit_id: c.unitId,
      granted_by: caller.id,
    }));
    
    const { error: insErr } = await admin.from('user_capabilities').insert(rows);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath(USERS_PATH);
  return { ok: true };
}

export async function toggleUserActiveAction(userId: string, is_active: boolean) {
  const caller = await requireUser();
  if (userId === caller.id) {
    return { error: 'You cannot activate or deactivate your own account.' };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('unit_id')
    .eq('id', userId)
    .maybeSingle();

  if (!target) return { error: 'User not found.' };

  await requireCapability('users.manage', target.unit_id);

  if ((caller.role === 'unit_admin' || caller.role === 'mess_secretary') && target.unit_id !== caller.homeUnitId) {
    return { error: 'You can only manage users within your own unit.' };
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from('profiles')
    .update({ is_active })
    .eq('id', userId);

  if (error) return { error: error.message };

  revalidatePath(USERS_PATH);
  return { ok: true };
}

export async function deleteUserAction(userId: string) {
  const caller = await requireUser();
  if (userId === caller.id) {
    return { error: 'You cannot delete your own account.' };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('unit_id')
    .eq('id', userId)
    .maybeSingle();

  if (!target) return { error: 'User not found.' };

  await requireCapability('users.manage', target.unit_id);

  if ((caller.role === 'unit_admin' || caller.role === 'mess_secretary') && target.unit_id !== caller.homeUnitId) {
    return { error: 'You can only manage users within your own unit.' };
  }

  const admin = createServiceClient();
  // Deleting user from Auth Admin cascades automatically to profiles table
  const { error: authDelErr } = await admin.auth.admin.deleteUser(userId);
  if (authDelErr) return { error: authDelErr.message };

  revalidatePath(USERS_PATH);
  return { ok: true };
}
