'use server';

import { revalidatePath } from 'next/cache';
import { getCollection } from '@/lib/mongo';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { writeAudit } from '@/lib/audit/write-audit';
import type { Role, Capability } from '@/lib/auth/types';
import type {
  UserDoc,
  UserCapabilityDoc,
  CapabilityTemplateDoc,
  DependantDoc,
} from '@/lib/users/types';
import { sendInvitationEmail } from '@/lib/email/resend';
import { inviteUserSchema, roleEnum } from '@/lib/schemas/users';
import { opsInviteBlock } from '@/lib/users/invite-rules';

const USERS_PATH = '/users';

export async function fetchUnitUsersAction(unitId?: string | null) {
  const caller = await requireUser();

  // Resolve target unit: unit_admin and mess_secretary are locked to their homeUnitId
  const targetUnit =
    caller.role === 'unit_admin' || caller.role === 'mess_secretary'
      ? caller.homeUnitId
      : unitId ?? caller.activeUnitId;

  await requireCapability('users.read', targetUnit);

  const usersCol = await getCollection<UserDoc>('users');
  const filter: Record<string, unknown> = {};
  if (targetUnit) {
    filter.unit_id = targetUnit;
  }

  const users = await usersCol.find(filter).sort({ full_name: 1 }).toArray();
  const userIds = users.map((u) => u.id);

  const capsCol = await getCollection<UserCapabilityDoc>('user_capabilities');
  const caps = await capsCol.find({ user_id: { $in: userIds } }).toArray();

  const capsByUser = new Map<string, { capability: Capability; unit_id: string | null }[]>();
  for (const c of caps) {
    const list = capsByUser.get(c.user_id) ?? [];
    list.push({ capability: c.capability, unit_id: c.unit_id });
    capsByUser.set(c.user_id, list);
  }

  const data = users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    full_name: u.full_name ?? null,
    role: u.role,
    unit_id: u.unit_id ?? null,
    is_active: u.is_active ?? true,
    rank: u.rank ?? null,
    service_no: u.service_no ?? null,
    display_name: u.display_name ?? u.full_name ?? null,
    created_at: u.created_at,
    updated_at: u.updated_at,
    user_capabilities: capsByUser.get(u.id) ?? [],
  }));

  return { ok: true, data };
}

export async function fetchCapabilityTemplatesAction() {
  await requireUser();
  const col = await getCollection<CapabilityTemplateDoc>('capability_templates');
  const data = await col.find({}).sort({ name: 1 }).toArray();

  return {
    ok: true,
    data: data.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? null,
      capabilities: t.capabilities ?? [],
      is_system: Boolean(t.is_system),
      created_at: t.created_at,
      updated_at: t.updated_at,
    })),
  };
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
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  await requireCapability('users.invite', parsed.data.unit_id);

  const blocked = opsInviteBlock(parsed.data.role);
  if (blocked) return { error: blocked };

  if (caller.role !== 'super_admin' && parsed.data.unit_id !== caller.homeUnitId) {
    return { error: 'Cannot invite users into other units.' };
  }

  const targetRole = parsed.data.role;
  const targetUnit = parsed.data.unit_id ?? null;
  const normalizedEmail = input.email.toLowerCase().trim();

  const usersCol = await getCollection<UserDoc>('users');
  const existing = await usersCol.findOne({ email: normalizedEmail });

  const invitedUserId = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();

  const userDoc: UserDoc = {
    id: invitedUserId,
    email: normalizedEmail,
    full_name: input.full_name || null,
    display_name: input.full_name || null,
    role: targetRole,
    unit_id: targetUnit,
    is_active: true,
    rank: existing?.rank || null,
    service_no: existing?.service_no || null,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (existing) {
    await usersCol.updateOne({ id: invitedUserId }, { $set: userDoc });
  } else {
    await usersCol.insertOne(userDoc);
  }

  // Provision capabilities if template is provided
  const capsCol = await getCollection<UserCapabilityDoc>('user_capabilities');
  if (input.capability_template_id && targetUnit) {
    const tplCol = await getCollection<CapabilityTemplateDoc>('capability_templates');
    const tpl = await tplCol.findOne({ id: input.capability_template_id });
    if (tpl?.capabilities && tpl.capabilities.length) {
      const rows: UserCapabilityDoc[] = tpl.capabilities.map((c) => ({
        id: crypto.randomUUID(),
        user_id: invitedUserId,
        capability: c as Capability,
        unit_id: targetUnit,
        granted_by: caller.id,
        created_at: now,
      }));
      await capsCol.insertMany(rows);
    }
  }

  // Provision explicit capabilities if provided
  if (input.capabilities && input.capabilities.length && targetUnit) {
    const rows: UserCapabilityDoc[] = input.capabilities.map((c) => ({
      id: crypto.randomUUID(),
      user_id: invitedUserId,
      capability: c as Capability,
      unit_id: targetUnit,
      granted_by: caller.id,
      created_at: now,
    }));
    await capsCol.insertMany(rows);
  }

  await writeAudit({
    table_name: 'users',
    row_pk: invitedUserId,
    op: existing ? 'UPDATE' : 'INSERT',
    changed_by: caller.id,
    active_unit_id: targetUnit,
    new_data: userDoc as unknown as Record<string, unknown>,
  });

  // Get unit name for custom invite email
  let unitName = "Officers' Mess";
  if (targetUnit) {
    const unitsCol = await getCollection('units');
    const unitData = await unitsCol.findOne({ id: targetUnit });
    if (unitData?.name) unitName = unitData.name;
  }

  const token = crypto.randomUUID();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const inviteLink = `${siteUrl}/accept-invite?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

  try {
    await sendInvitationEmail({
      email: input.email,
      fullName: input.full_name,
      inviteLink,
      unitName,
      role: targetRole,
    });
  } catch (err) {
    console.error('Failed to send invitation email via Resend:', err);
    return { error: 'Could not send the invitation email.' };
  }

  revalidatePath(USERS_PATH);
  return { ok: true, data: { id: invitedUserId, email: input.email } };
}

export async function updateUserAction(
  userId: string,
  input: {
    full_name?: string;
    service_no?: string;
    rank?: string;
    role?: Role;
    unit_id?: string | null;
  },
) {
  const caller = await requireUser();

  if (userId === caller.id) {
    return { error: 'You cannot edit your own account details from here.' };
  }

  const usersCol = await getCollection<UserDoc>('users');
  const target = await usersCol.findOne({ id: userId });
  if (!target) return { error: 'User not found.' };

  await requireCapability('users.manage', target.unit_id);

  // Role/unit changes only by super_admin
  const wantsRoleChange = input.role !== undefined;
  const wantsUnitChange = input.unit_id !== undefined;
  if ((wantsRoleChange || wantsUnitChange) && caller.role !== 'super_admin') {
    return { error: 'Only super admin may change user roles or units.' };
  }

  if (
    (caller.role === 'unit_admin' || caller.role === 'mess_secretary') &&
    target.unit_id !== caller.homeUnitId
  ) {
    return { error: 'You can only edit users within your own unit.' };
  }

  if (input.role !== undefined && !roleEnum.safeParse(input.role).success) {
    return { error: 'Invalid role' };
  }

  if (input.role !== undefined || input.unit_id !== undefined) {
    const finalUnitId = input.unit_id !== undefined ? input.unit_id : target.unit_id;
    if (!finalUnitId) {
      return { error: 'A unit is required' };
    }
  }

  const now = new Date().toISOString();
  const updateFields: Partial<UserDoc> = { updated_at: now };
  if (input.full_name !== undefined) updateFields.full_name = input.full_name || null;
  if (input.service_no !== undefined) updateFields.service_no = input.service_no || null;
  if (input.rank !== undefined) updateFields.rank = input.rank || null;
  if (input.role !== undefined) updateFields.role = input.role;
  if (input.unit_id !== undefined) updateFields.unit_id = input.unit_id;

  await usersCol.updateOne({ id: userId }, { $set: updateFields });

  await writeAudit({
    table_name: 'users',
    row_pk: userId,
    op: 'UPDATE',
    changed_by: caller.id,
    active_unit_id: target.unit_id,
    old_data: target as unknown as Record<string, unknown>,
    new_data: { ...target, ...updateFields } as unknown as Record<string, unknown>,
  });

  revalidatePath(USERS_PATH);
  return { ok: true };
}

export async function updateUserCapabilitiesAction(
  userId: string,
  capabilities: { capability: Capability; unitId: string }[],
) {
  const caller = await requireUser();
  if (userId === caller.id) {
    return { error: 'You cannot edit your own capability permissions.' };
  }

  const usersCol = await getCollection<UserDoc>('users');
  const target = await usersCol.findOne({ id: userId });
  if (!target) return { error: 'User not found.' };

  await requireCapability('users.manage', target.unit_id);

  if (caller.role === 'unit_admin' || caller.role === 'mess_secretary') {
    if (target.unit_id !== caller.homeUnitId) {
      return { error: 'You can only manage users within your own unit.' };
    }
    for (const cap of capabilities) {
      if (cap.unitId && cap.unitId !== caller.homeUnitId) {
        return { error: 'Cannot grant capabilities outside your own unit.' };
      }
    }
  }

  const capsCol = await getCollection<UserCapabilityDoc>('user_capabilities');
  await capsCol.deleteMany({ user_id: userId });

  const now = new Date().toISOString();
  if (capabilities.length) {
    const rows: UserCapabilityDoc[] = capabilities.map((c) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      capability: c.capability,
      unit_id: c.unitId,
      granted_by: caller.id,
      created_at: now,
    }));
    await capsCol.insertMany(rows);
  }

  await writeAudit({
    table_name: 'user_capabilities',
    row_pk: userId,
    op: 'UPDATE',
    changed_by: caller.id,
    active_unit_id: target.unit_id,
    new_data: { capabilities } as unknown as Record<string, unknown>,
  });

  revalidatePath(USERS_PATH);
  return { ok: true };
}

export async function toggleUserActiveAction(userId: string, is_active: boolean) {
  const caller = await requireUser();
  if (userId === caller.id) {
    return { error: 'You cannot activate or deactivate your own account.' };
  }

  const usersCol = await getCollection<UserDoc>('users');
  const target = await usersCol.findOne({ id: userId });
  if (!target) return { error: 'User not found.' };

  await requireCapability('users.manage', target.unit_id);

  if (
    (caller.role === 'unit_admin' || caller.role === 'mess_secretary') &&
    target.unit_id !== caller.homeUnitId
  ) {
    return { error: 'You can only manage users within your own unit.' };
  }

  const now = new Date().toISOString();
  await usersCol.updateOne({ id: userId }, { $set: { is_active, updated_at: now } });

  await writeAudit({
    table_name: 'users',
    row_pk: userId,
    op: 'UPDATE',
    changed_by: caller.id,
    active_unit_id: target.unit_id,
    old_data: { is_active: target.is_active },
    new_data: { is_active },
  });

  revalidatePath(USERS_PATH);
  return { ok: true };
}

export async function deleteUserAction(userId: string) {
  const caller = await requireUser();
  if (userId === caller.id) {
    return { error: 'You cannot delete your own account.' };
  }

  const usersCol = await getCollection<UserDoc>('users');
  const target = await usersCol.findOne({ id: userId });
  if (!target) return { error: 'User not found.' };

  await requireCapability('users.manage', target.unit_id);

  if (
    (caller.role === 'unit_admin' || caller.role === 'mess_secretary') &&
    target.unit_id !== caller.homeUnitId
  ) {
    return { error: 'You can only manage users within your own unit.' };
  }

  await usersCol.deleteOne({ id: userId });

  const capsCol = await getCollection<UserCapabilityDoc>('user_capabilities');
  await capsCol.deleteMany({ user_id: userId });

  const depsCol = await getCollection<DependantDoc>('dependants');
  await depsCol.deleteMany({ primary_profile_id: userId });

  await writeAudit({
    table_name: 'users',
    row_pk: userId,
    op: 'DELETE',
    changed_by: caller.id,
    active_unit_id: target.unit_id,
    old_data: target as unknown as Record<string, unknown>,
  });

  revalidatePath(USERS_PATH);
  return { ok: true };
}
