import type { AuthUser, Capability, Role } from './types';

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[] | '*'> = {
  super_admin: '*',
  admin: '*',
  unit_admin: '*',
  mess_secretary: '*',
  mess_havildar: [
    'attendance.read',
    'attendance.write',
    'ration.read',
    'ration.issue',
    'inventory.read',
    'inventory.write',
    'reports.unit',
  ],
  bar_nco: [
    'bar.read',
    'bar.write',
    'inventory.read',
    'inventory.write',
  ],
  property_nco: [
    'rooms.read',
    'rooms.booking.write',
    'rooms.manage',
  ],
  user: [
    'billing.read',
    'attendance.read',
  ],
  manager: [
    'masters.read',
    'inventory.read',
    'attendance.read',
    'ration.read',
    'bar.read',
    'rooms.read',
    'parties.read',
    'billing.read',
  ],
};

export function userHasCapability(user: AuthUser, cap: Capability, unitId?: string | null): boolean {
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  const roleCaps = ROLE_CAPABILITIES[user.role as Role];

  const homeUnit = user.home_unit_id ?? user.homeUnitId;

  if (roleCaps === '*') {
    if (unitId == null) return true;
    return homeUnit === unitId;
  }

  if (roleCaps && roleCaps.includes(cap)) {
    if (unitId == null) return true;
    return homeUnit === unitId;
  }

  return (user.capabilities ?? []).some((g: string | GrantedCapability) => {
    if (typeof g === 'string') {
      return g === cap || g === '*';
    }
    return g.capability === cap && (g.unitId == null || unitId == null || g.unitId === unitId);
  });
}
