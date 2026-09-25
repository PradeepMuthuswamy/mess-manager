import 'server-only';

import { getDb } from '@/lib/mongo';
import { sendInvitationEmail } from '@/lib/email/resend';

export interface InviteFirstUnitAdminInput {
  email: string;
  fullName: string;
  unitId: string;
  unitName: string;
}

/**
 * Invite the first unit_admin for a unit that was just created.
 * Sets up profile and invitation in MongoDB and sends an email via Resend.
 * Compatible with both (input) and (legacyClient, input) call signatures.
 */
export async function inviteFirstUnitAdmin(
  input: InviteFirstUnitAdminInput,
): Promise<{ ok: true } | { error: string }>;
export async function inviteFirstUnitAdmin(
  client: unknown,
  input: InviteFirstUnitAdminInput,
): Promise<{ ok: true } | { error: string }>;
export async function inviteFirstUnitAdmin(
  inputOrClient: unknown,
  maybeInput?: InviteFirstUnitAdminInput,
): Promise<{ ok: true } | { error: string }> {
  const input: InviteFirstUnitAdminInput =
    maybeInput ?? (inputOrClient as InviteFirstUnitAdminInput);

  if (!input || !input.email) {
    return { error: 'Invalid invitation input' };
  }

  const normalizedEmail = input.email.toLowerCase().trim();
  const db = await getDb();
  const profilesCol = db.collection('profiles');
  const invitationsCol = db.collection('invitations');

  const now = new Date().toISOString();
  let userId: string;

  // Check if profile exists
  const existingProfile = await profilesCol.findOne({ email: normalizedEmail });
  if (existingProfile) {
    userId = String(existingProfile.id || existingProfile._id?.toString() || '');
    await profilesCol.updateOne(
      { email: normalizedEmail },
      {
        $set: {
          role: 'unit_admin',
          unit_id: input.unitId,
          full_name: input.fullName.trim(),
          updated_at: now,
        },
      },
    );
  } else {
    userId = crypto.randomUUID();
    await profilesCol.insertOne({
      id: userId,
      email: normalizedEmail,
      full_name: input.fullName.trim(),
      role: 'unit_admin',
      unit_id: input.unitId,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  }

  const token = crypto.randomUUID();
  await invitationsCol.insertOne({
    id: crypto.randomUUID(),
    token,
    user_id: userId,
    email: normalizedEmail,
    role: 'unit_admin',
    unit_id: input.unitId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: now,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const inviteLink = `${siteUrl}/accept-invite?token=${token}`;

  try {
    await sendInvitationEmail({
      email: input.email,
      fullName: input.fullName,
      inviteLink,
      unitName: input.unitName,
      role: 'unit_admin',
    });
  } catch (err) {
    console.error('Failed to send unit admin invitation:', err);
    return { error: 'Could not send the invitation email.' };
  }

  return { ok: true };
}
