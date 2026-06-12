// Pure capability helpers — safe to import from client OR server components.
// Anything that needs server-only APIs (cookies, redirects) lives in require-capability.ts.
import type { AuthUser, Capability } from './types';

export function userHasCapability(user: AuthUser, cap: Capability, unitId?: string | null): boolean {
  if (user.role === 'super_admin') return true;

  if (user.role === 'unit_admin' || user.role === 'mess_secretary') {
    if (unitId == null) return true;
    return user.homeUnitId === unitId;
  }

  if (user.role === 'mess_havildar') {
    if (unitId != null && user.homeUnitId !== unitId) return false;
    const allowed: Capability[] = [
      'attendance.read', 'attendance.write',
      'ration.read', 'ration.issue',
      'inventory.read', 'inventory.write',
      'reports.unit'
    ];
    if (allowed.includes(cap)) return true;
  }

  if (user.role === 'bar_nco') {
    if (unitId != null && user.homeUnitId !== unitId) return false;
    const allowed: Capability[] = [
      'bar.read', 'bar.write',
      'inventory.read', 'inventory.write'
    ];
    if (allowed.includes(cap)) return true;
  }

  if (user.role === 'property_nco') {
    if (unitId != null && user.homeUnitId !== unitId) return false;
    const allowed: Capability[] = [
      'rooms.read', 'rooms.booking.write', 'rooms.manage'
    ];
    if (allowed.includes(cap)) return true;
  }

  if (user.role === 'user') {
    if (unitId != null && user.homeUnitId !== unitId) return false;
    const allowed: Capability[] = [
      'billing.read', 'attendance.read'
    ];
    if (allowed.includes(cap)) return true;
  }

  if (user.role === 'manager') {
    if (unitId != null && user.homeUnitId !== unitId) return false;
    const allowed: Capability[] = [
      'masters.read', 'inventory.read', 'attendance.read',
      'ration.read', 'bar.read', 'rooms.read',
      'parties.read', 'billing.read'
    ];
    if (allowed.includes(cap)) return true;
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
