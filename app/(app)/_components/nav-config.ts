import type { Capability, Role } from '@/lib/auth/types';

export type NavItem = {
  label: string;
  href?: string;
  icon: string; // lucide icon name
  requires?: Capability | Capability[];
  requiresRole?: Role[]; // bypass capabilities; role must match
  children?: NavItem[];
};

// Diner/Officer portal navigation - visible to all members
export const NAV_DINER: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard',    icon: 'LayoutDashboard' },
  { label: 'My Messing',   href: '/messing',      icon: 'CalendarCheck' },
  { label: 'My Bills',     href: '/billing',      icon: 'ReceiptText' },
  { label: 'Settings',     href: '/settings',     icon: 'Settings' },
];

// Mess Manager & Quartermaster operations navigation - capability gated
export const NAV_OPS: NavItem[] = [
  { label: 'Attendance',   href: '/attendance',   icon: 'ClipboardList', requires: 'attendance.read' },
  { label: 'Ration',       href: '/ration',       icon: 'Boxes',         requires: 'ration.read' },
  { label: 'Inventory',    href: '/inventory',    icon: 'PackageOpen',   requires: 'inventory.read' },
  { label: 'Masters',      href: '/masters',      icon: 'Database',      requires: 'masters.read' },
  { label: 'Bar Registry', href: '/bar',          icon: 'Martini',       requires: 'bar.read' },
  { label: 'Party Bookings', href: '/party',      icon: 'PartyPopper',   requires: 'parties.read' },
  { label: 'Guest Rooms',  href: '/guest-rooms',  icon: 'BedDouble',     requires: 'rooms.read' },
  { label: 'Billing Ops',  href: '/billing',      icon: 'ReceiptText',   requires: 'billing.read' },
];

// Fallback interface requirements
export function navForPath(pathname: string) {
  return {
    diner: NAV_DINER,
    ops: NAV_OPS,
  };
}
