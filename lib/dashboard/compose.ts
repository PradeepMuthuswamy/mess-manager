import type { AuthUser, Capability } from '@/lib/auth/types';
import { userHasCapability } from '@/lib/auth/capabilities';
import type { ModuleId } from './modules';

const WIDGET_IDS = [
  'member-messing',
  'member-bills',
  'president-kpis',
  'outstanding-dues',
  'occupancy',
  'ration-alert',
  'secretary-approvals',
  'billing-period',
  'register-queue',
  'prate-trend',
  'bar-pending',
  'arrivals',
  'havildar-today',
  'social-upcoming',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export type DashboardComposition = {
  widgetIds: WidgetId[];
  isReadOnlyPresident: boolean;
};

function hasModule(enabled: ReadonlySet<ModuleId>, id: ModuleId): boolean {
  return enabled.has(id);
}

/**
 * Compose a unique widget list from enabled modules + appointment
 * capabilities (REQ-DASH-02, REQ-DASH-03). President (manager) widgets
 * are read-only (REQ-DASH-11).
 */
export function composeDashboardWidgets(
  user: AuthUser,
  unitId: string,
  enabledModules: readonly ModuleId[],
): DashboardComposition {
  const enabled = new Set<ModuleId>(enabledModules);
  const widgets = new Set<WidgetId>();
  const cap = (capability: Capability) => userHasCapability(user, capability, unitId);

  widgets.add('member-messing');
  if (hasModule(enabled, 'billing')) {
    widgets.add('member-bills');
  }

  if (user.role === 'manager') {
    widgets.add('president-kpis');
    widgets.add('outstanding-dues');
    if (hasModule(enabled, 'guest_rooms')) widgets.add('occupancy');
    if (hasModule(enabled, 'ration')) widgets.add('ration-alert');
  }

  if (user.role === 'unit_admin' || user.role === 'mess_secretary') {
    widgets.add('secretary-approvals');
    widgets.add('billing-period');
  }

  if (cap('messing.approve')) {
    widgets.add('register-queue');
    widgets.add('prate-trend');
  }

  if (
    hasModule(enabled, 'bar') &&
    (cap('bar.write') || cap('bar.finalize'))
  ) {
    widgets.add('bar-pending');
  }

  if (hasModule(enabled, 'guest_rooms') && cap('rooms.booking.write')) {
    widgets.add('arrivals');
  }

  if (hasModule(enabled, 'attendance') && cap('attendance.write')) {
    widgets.add('havildar-today');
  }

  if (hasModule(enabled, 'calendar')) {
    widgets.add('social-upcoming');
  }

  return {
    widgetIds: [...widgets],
    isReadOnlyPresident: user.role === 'manager',
  };
}
