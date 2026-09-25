import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/lib/auth/auth';
import { getDb } from '@/lib/mongo';
import { ACTIVE_UNIT_COOKIE } from './types';
import type { Role, GrantedCapability } from './types';
import { ROLE_CAPABILITIES } from './capabilities';
import { Errors } from '@/lib/api/errors';

export interface UserDoc {
  _id?: ObjectId;
  id?: string;
  email?: string;
  role?: string;
  home_unit_id?: string;
  unit_id?: string;
  capabilities?: (string | GrantedCapability)[];
  status?: string;
  rank?: string;
  service_number?: string;
  full_name?: string;
  name?: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  home_unit_id: string | null;
  active_unit_id: string | null;
  capabilities: string[];
  status: string;
  rank: string | null;
  service_number: string | null;
  full_name: string | null;

  // Compatibility aliases with AuthUser
  homeUnitId: string | null;
  activeUnitId: string | null;
  isAllUnits: boolean;
  displayName: string | null;
}

export function userHasCapability(
  user: CurrentUser,
  cap: string,
  unitId?: string | null
): boolean {
  if (user.role === 'super_admin' || user.role === 'admin') return true;

  const roleCaps = ROLE_CAPABILITIES[user.role as Role];
  if (roleCaps === '*') {
    if (unitId == null) return true;
    return (user.home_unit_id ?? user.homeUnitId) === unitId;
  }

  if (roleCaps && (roleCaps as readonly string[]).includes(cap)) {
    if (unitId == null) return true;
    return (user.home_unit_id ?? user.homeUnitId) === unitId;
  }

  return (user.capabilities ?? []).some((c: string | GrantedCapability) => {
    if (typeof c === 'string') {
      return c === cap || c === '*';
    }
    return c.capability === cap && (c.unitId == null || unitId == null || c.unitId === unitId);
  });
}

export const getCurrentUser = cache(async (customHeaders?: Headers | NextRequest): Promise<CurrentUser | null> => {
  let reqHeaders: Headers;
  let nextReq: NextRequest | undefined;

  if (customHeaders instanceof Headers) {
    reqHeaders = customHeaders;
  } else if (customHeaders && 'headers' in customHeaders) {
    nextReq = customHeaders as NextRequest;
    reqHeaders = nextReq.headers;
  } else {
    try {
      reqHeaders = await headers();
    } catch {
      reqHeaders = new Headers();
    }
  }

  const sessionData = await auth.api.getSession({ headers: reqHeaders });
  if (!sessionData?.user) {
    return null;
  }

  const sessionUser = sessionData.user;
  const db = await getDb();
  const userId = sessionUser.id;

  let userDoc: UserDoc | null = null;
  try {
    const filter = ObjectId.isValid(userId)
      ? { $or: [{ _id: new ObjectId(userId) }, { id: userId }] }
      : { id: userId };

    userDoc = await db.collection('users').findOne(filter)
      || await db.collection('user').findOne(filter);
  } catch (err) {
    console.error('Error querying user collection in getCurrentUser:', err);
  }

  if (!userDoc && sessionUser.email) {
    try {
      userDoc = await db.collection('users').findOne({ email: sessionUser.email.toLowerCase() })
        || await db.collection('user').findOne({ email: sessionUser.email.toLowerCase() });
    } catch {
      // ignore
    }
  }

  const rawDoc: UserDoc = userDoc || (sessionUser as unknown as UserDoc);

  const role = (rawDoc.role as string) || (sessionUser.role as string) || 'user';
  const home_unit_id = rawDoc.home_unit_id || rawDoc.unit_id || (sessionUser.unit_id as string) || null;

  // Resolve active_unit_id
  let cookieUnit: string | null = null;
  if (nextReq) {
    const headerUnit = nextReq.headers.get('x-unit-id');
    const queryUnit = new URL(nextReq.url).searchParams.get('unit');
    cookieUnit = headerUnit ?? queryUnit ?? nextReq.cookies.get(ACTIVE_UNIT_COOKIE)?.value ?? null;
  } else {
    try {
      const cookieStore = await cookies();
      cookieUnit = cookieStore.get(ACTIVE_UNIT_COOKIE)?.value ?? null;
    } catch {
      // not in request/cookies context
    }
  }

  let active_unit_id: string | null;
  let isAllUnits: boolean;
  if (role === 'super_admin' || role === 'admin') {
    active_unit_id = cookieUnit && cookieUnit !== 'all' ? cookieUnit : null;
    isAllUnits = !active_unit_id;
  } else {
    active_unit_id = home_unit_id;
    isAllUnits = false;
  }

  let capabilities: string[] = [];
  if (Array.isArray(rawDoc.capabilities)) {
    capabilities = rawDoc.capabilities.map((c: string | GrantedCapability) => (typeof c === 'string' ? c : c.capability));
  } else if (Array.isArray(sessionUser.capabilities)) {
    capabilities = (sessionUser.capabilities as (string | GrantedCapability)[]).map((c: string | GrantedCapability) => (typeof c === 'string' ? c : c.capability));
  }

  const currentUser: CurrentUser = {
    id: (rawDoc._id ? rawDoc._id.toString() : rawDoc.id) || userId,
    email: rawDoc.email || sessionUser.email || '',
    role: role as Role,
    home_unit_id,
    active_unit_id,
    capabilities,
    status: rawDoc.status || 'active',
    rank: rawDoc.rank || null,
    service_number: rawDoc.service_number || null,
    full_name: rawDoc.full_name || rawDoc.name || sessionUser.name || null,

    // CamelCase compatibility aliases for AuthUser
    homeUnitId: home_unit_id,
    activeUnitId: active_unit_id,
    isAllUnits,
    displayName: rawDoc.full_name || rawDoc.name || rawDoc.email || sessionUser.name || sessionUser.email || null,
  };

  return currentUser;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  // App segregation: super_admin accounts manage the platform from Admin Console and may not hold a session in ops app
  if (user.role === 'super_admin' || user.role === 'admin') {
    redirect('/auth/signout?error=admin_console');
  }

  return user;
}

export async function requireRole(
  allowed: (Role | string)[],
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    redirect('/dashboard');
  }
  return user;
}

export async function requireCapability(
  cap: string,
  unitId?: string | null
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!userHasCapability(user, cap, unitId)) {
    redirect('/dashboard');
  }
  return user;
}

export type ApiContext = CurrentUser & {
  user: CurrentUser;
};

export async function requireApiUser(req: NextRequest): Promise<ApiContext> {
  const user = await getCurrentUser(req);
  if (!user) {
    throw Errors.unauthenticated('Token invalid or expired');
  }

  // App segregation for ops API
  if (user.role === 'super_admin' || user.role === 'admin') {
    throw Errors.forbidden('Admin accounts must use the Admin Console.');
  }

  return Object.assign(user, { user });
}
