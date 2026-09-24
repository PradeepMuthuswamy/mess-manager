import type { Capability, Role } from '@/lib/auth/types';

export type NavModule =
  | 'attendance'
  | 'ration'
  | 'bar'
  | 'guest_rooms'
  | 'billing'
  | 'parties'
  | 'calendar';

export type NavItem = {
  label: string;
  href?: string;
  icon: string; // lucide icon name
  requires?: Capability | Capability[];
  requiresRole?: Role[]; // bypass capabilities; role must match
  /** When set, hide this item if the unit disabled that module (REQ-DASH-10). */
  module?: NavModule;
  children?: NavItem[];
};

/** Skip filter when modules are unknown; items without `module` always show. */
export function navItemMatchesModules(
  item: NavItem,
  enabledModules?: readonly string[] | null,
): boolean {
  if (!enabledModules || !item.module) return true;
  return enabledModules.includes(item.module);
}

// Diner/Officer portal navigation - visible to all members
const NAV_DINER: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',    icon: 'LayoutDashboard' },
  { label: 'My Messing',   href: '/messing',      icon: 'CalendarCheck' },
  { label: 'My Bills',     href: '/billing',      icon: 'ReceiptText' },
  { label: 'Bulletins',    href: '/bulletins',    icon: 'Megaphone' },
  { label: 'Calendar',     href: '/calendar',     icon: 'CalendarDays', module: 'calendar' },
  { label: 'Parties',      href: '/party',        icon: 'PartyPopper',  module: 'parties' },
  { label: 'My Report',    href: '/reports',      icon: 'BarChart3' },
  { label: 'Room requests', href: '/waitlist',    icon: 'BedDouble',    module: 'guest_rooms' },
];

// Mess Manager & Quartermaster operations navigation - capability gated
const NAV_OPS: NavItem[] = [
  { label: 'Attendance',   href: '/attendance',   icon: 'ClipboardList', requires: 'attendance.read', module: 'attendance' },
  { label: 'Messing',      href: '/messing/cuts', icon: 'Scissors',      requires: 'attendance.write', module: 'attendance' },
  { label: 'Ration',       href: '/ration',       icon: 'Boxes',         requires: 'ration.read', module: 'ration' },
  { label: 'Stock',        href: '/stock',        icon: 'PackageOpen',   requires: 'inventory.read' },
  { label: 'Bar',          href: '/bar',          icon: 'Martini',       requires: 'bar.read', module: 'bar' },
  { label: 'Grocery',      href: '/grocery',      icon: 'ShoppingBasket', requires: 'masters.read' },
  { label: 'Party Bookings', href: '/party',      icon: 'PartyPopper', module: 'parties' },
  { label: 'Guest Rooms',  href: '/guest-rooms',  icon: 'BedDouble',     requires: 'rooms.read', module: 'guest_rooms' },
  { label: 'Billing Ops',  href: '/billing',      icon: 'ReceiptText',   requires: 'billing.read', module: 'billing' },
  { label: 'Unit report',  href: '/reports',      icon: 'BarChart3',     requires: 'reports.unit' },
  { label: 'Users',        href: '/users',        icon: 'Users',         requires: 'users.read' },
  { label: 'Settings',     href: '/settings',     icon: 'Settings' },
];

// Fallback interface requirements
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function navForPath(_pathname: string) {
  return {
    diner: NAV_DINER,
    ops: NAV_OPS,
  };
}
