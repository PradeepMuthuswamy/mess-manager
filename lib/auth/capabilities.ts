// Pure capability helpers — safe to import from client OR server components.
// Anything that needs server-only APIs (cookies, redirects) lives in require-capability.ts.
import type { AuthUser, Capability } from './types';

export function userHasCapability(user: AuthUser, cap: Capability, unitId?: string | null): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'unit_admin') {
    if (unitId == null) return true;
    return user.homeUnitId === unitId;
  }
  return user.capabilities.some(
    (g) =>
      g.capability === cap &&
      (g.unitId == null || unitId == null || g.unitId === unitId),
  );
}

export function userHasAnyCapability(user: AuthUser, caps: Capability[]): boolean {
  return caps.some((c) => userHasCapability(user, c));
}
