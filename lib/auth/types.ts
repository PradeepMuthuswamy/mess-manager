export type Role = 'user' | 'manager' | 'unit_admin' | 'admin';

export const CAPABILITIES = [
  'masters.read','masters.write','masters.write.global',
  'attendance.read','attendance.write','attendance.finalize',
  'ration.read','ration.issue','ration.adjust',
  'inventory.read','inventory.write',
  'bar.read','bar.write','bar.finalize',
  'rooms.read','rooms.booking.write','rooms.manage',
  'parties.read','parties.write','parties.finalize',
  'users.read','users.invite','users.manage',
  'reports.unit','reports.cross_unit',
  'billing.read','billing.draft','billing.finalize',
] as const;
export type Capability = typeof CAPABILITIES[number];

// Human-readable group headers shown to non-technical users.
export const CAPABILITY_DOMAIN_LABELS: Record<string, string> = {
  masters:    'Master lists',
  attendance: 'Attendance',
  ration:     'Ration issuing',
  inventory:  'Stock',
  bar:        'Bar',
  rooms:      'Guest rooms',
  parties:    'Parties',
  users:      'Users',
  reports:    'Reports',
  billing:    'Billing',
};

// Friendly action label per capability (no domain repetition — labels are
// shown grouped under their domain header).
export const CAPABILITY_ACTION_LABELS: Record<Capability, string> = {
  'masters.read':          'View master lists',
  'masters.write':          'Add or edit master items',
  'masters.write.global':   'Edit the global catalog (all units)',

  'attendance.read':        'View attendance',
  'attendance.write':       'Record daily attendance',
  'attendance.finalize':    'Finalise attendance for a period',

  'ration.read':            'View ration issues',
  'ration.issue':           'Issue rations',
  'ration.adjust':          'Adjust ration entries',

  'inventory.read':         'View stock lots',
  'inventory.write':        'Manage stock lots',

  'bar.read':               'View bar consumption',
  'bar.write':              'Log bar consumption',
  'bar.finalize':           'Finalise the bar bill',

  'rooms.read':             'View guest rooms',
  'rooms.booking.write':    'Make and edit room bookings',
  'rooms.manage':           'Manage room inventory & rates',

  'parties.read':           'View parties',
  'parties.write':          'Plan and record parties',
  'parties.finalize':       'Finalise party bills',

  'users.read':             'View users',
  'users.invite':           'Invite new users',
  'users.manage':           'Manage users (deactivate, change unit)',

  'reports.unit':           'See this unit’s reports',
  'reports.cross_unit':     'See cross-unit reports',

  'billing.read':           'View bills',
  'billing.draft':          'Draft bills',
  'billing.finalize':       'Finalise and publish bills',
};

export function capabilityLabel(cap: Capability) {
  return CAPABILITY_ACTION_LABELS[cap] ?? cap;
}

export function capabilityDomain(cap: Capability): string {
  return cap.split('.')[0];
}

export function capabilityDomainLabel(cap: Capability): string {
  const d = capabilityDomain(cap);
  return CAPABILITY_DOMAIN_LABELS[d] ?? d;
}

// A granted capability optionally scoped to a unit.
export type GrantedCapability = { capability: Capability; unitId: string | null };

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  homeUnitId: string | null;
  activeUnitId: string | null;   // for admin: cookie-driven; otherwise = homeUnitId
  isAllUnits: boolean;           // true only for admin with no active unit
  displayName: string | null;
  capabilities: GrantedCapability[];
};

export const ACTIVE_UNIT_COOKIE = 'active_unit_id';
