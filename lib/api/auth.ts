import type { NextRequest } from 'next/server';
import { requireApiUser as baseRequireApiUser, type ApiContext } from '@/lib/auth/get-current-user';
import type { Role, Capability } from '@/lib/auth/types';
import { userHasCapability } from '@/lib/auth/capabilities';
import { Errors } from './errors';

export { baseRequireApiUser as requireApiUser, type ApiContext };

export async function requireApiRole(req: NextRequest, roles: (Role | string)[]): Promise<ApiContext> {
  const ctx = await baseRequireApiUser(req);
  if (!roles.includes(ctx.user.role)) {
    throw Errors.forbidden(`Requires role: ${roles.join('|')}`);
  }
  return ctx;
}

export async function requireApiCapability(
  req: NextRequest,
  cap: Capability | string,
  unitId?: string | null,
): Promise<ApiContext> {
  const ctx = await baseRequireApiUser(req);
  if (!userHasCapability(ctx.user, cap as Capability, unitId ?? null)) {
    throw Errors.forbidden(`Requires capability: ${cap}`);
  }
  return ctx;
}
