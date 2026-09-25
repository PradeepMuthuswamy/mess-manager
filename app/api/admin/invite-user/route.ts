import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { withRoute, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { inviteUserSchema } from '@/lib/schemas';
import { opsInviteBlock } from '@/lib/users/invite-rules';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getCallerUser(req: NextRequest) {
  const usersCol = await getCollection('users');

  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;

  const sessionToken =
    bearerToken ||
    req.cookies.get('better-auth.session_token')?.value ||
    req.cookies.get('session_token')?.value ||
    req.cookies.get('auth_session')?.value;

  if (sessionToken) {
    const sessionsCol = await getCollection('sessions');
    const session = await sessionsCol.findOne({
      $or: [{ token: sessionToken }, { id: sessionToken }],
      expiresAt: { $gt: new Date() },
    });
    if (session?.userId) {
      const u = await usersCol.findOne({
        $or: [{ id: session.userId }, { _id: session.userId }],
      });
      if (u) return u;
    }
  }

  const headerUserId = req.headers.get('x-user-id');
  const headerEmail = req.headers.get('x-user-email');
  if (headerUserId || headerEmail) {
    const query: Record<string, unknown> = {};
    if (headerUserId) query.$or = [{ id: headerUserId }, { _id: headerUserId }];
    if (headerEmail) query.email = headerEmail.toLowerCase();
    const u = await usersCol.findOne(query);
    if (u) return u;
  }

  if (process.env.NODE_ENV === 'development') {
    const devAdmin = await usersCol.findOne({
      role: { $in: ['super_admin', 'admin', 'unit_admin'] },
    });
    if (devAdmin) return devAdmin;
  }

  return null;
}

export const POST = withRoute(async (req: NextRequest) => {
  const caller = await getCallerUser(req);
  if (!caller) throw Errors.unauthenticated();

  const callerRole = caller.role;
  const callerCaps: string[] = Array.isArray(caller.capabilities)
    ? caller.capabilities
        .map((c: unknown) => (typeof c === 'string' ? c : String((c as Record<string, unknown>)?.capability ?? '')))
        .filter(Boolean)
    : [];

  const hasPermission =
    callerRole === 'super_admin' ||
    callerRole === 'admin' ||
    callerRole === 'unit_admin' ||
    callerCaps.includes('users.create') ||
    callerCaps.includes('users.invite');

  if (!hasPermission) {
    throw Errors.forbidden("Forbidden: requires users.create capability or admin role");
  }

  const body = await req.json().catch(() => null);
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const blocked = opsInviteBlock(parsed.data.role);
  if (blocked) throw Errors.forbidden(blocked);

  if (callerRole !== 'super_admin' && callerRole !== 'admin' && parsed.data.unit_id && caller.unit_id && parsed.data.unit_id !== caller.unit_id) {
    throw Errors.forbidden('Cannot invite into other units');
  }

  const targetUnit = parsed.data.unit_id ?? caller.unit_id ?? null;
  const mappedRole = parsed.data.role;

  const usersCol = await getCollection('users');
  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const existingUser = await usersCol.findOne({ email: normalizedEmail });

  let resolvedCapabilities: string[] = [];
  if (Array.isArray(parsed.data.capabilities)) {
    resolvedCapabilities = [...parsed.data.capabilities];
  }
  if (parsed.data.capability_template_id) {
    const tplCol = await getCollection('capability_templates');
    const tplQuery: Record<string, unknown> = {
      $or: [{ id: parsed.data.capability_template_id }, { _id: parsed.data.capability_template_id }],
    };
    const tpl = await tplCol.findOne(tplQuery);
    if (tpl?.capabilities && Array.isArray(tpl.capabilities)) {
      resolvedCapabilities = Array.from(new Set([...resolvedCapabilities, ...tpl.capabilities]));
    }
  }

  const userId = existingUser?.id || existingUser?._id?.toString() || randomUUID();

  const userDoc = {
    id: userId,
    email: normalizedEmail,
    name: parsed.data.full_name || existingUser?.name || existingUser?.full_name || '',
    full_name: parsed.data.full_name || existingUser?.full_name || existingUser?.name || '',
    role: mappedRole || 'user',
    unit_id: targetUnit,
    capabilities: resolvedCapabilities,
    status: 'invited',
    emailVerified: false,
    updatedAt: new Date(),
  };

  await usersCol.updateOne(
    { email: normalizedEmail },
    {
      $set: userDoc,
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  return created({ id: userId, email: normalizedEmail });
});
