import { Suspense } from 'react';
import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import type { Role } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { composeDashboardWidgets } from '@/lib/dashboard/compose';
import { defaultEnabledModules, getEnabledModules } from '@/lib/dashboard/modules';
import { SecretaryShortcuts } from './_components/secretary-shortcuts';
import { MobileActionStrip } from './_components/mobile-action-strip';
import { DashboardPanels } from './_components/dashboard-panels';
import { DashboardSkeleton } from './_components/dashboard-skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<Role, string> = {
  user: 'Member',
  manager: 'Manager',
  unit_admin: 'Unit Admin',
  super_admin: 'Super Admin',
  mess_secretary: 'Mess Secretary',
  mess_havildar: 'Mess Havildar',
  bar_nco: 'Bar NCO',
  property_nco: 'Property NCO',
};

export default async function DashboardPage() {
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;
  const supabase = await createClient();

  const [{ data: profile }, { data: unit }, enabledModules] = await Promise.all([
    supabase
      .from('profiles')
      .select('rank, service_no, full_name, display_name, dining_in')
      .eq('id', user.id)
      .maybeSingle(),
    unitId
      ? supabase.from('units').select('id, name, code').eq('id', unitId).maybeSingle()
      : Promise.resolve({ data: null }),
    unitId
      ? getEnabledModules(unitId).catch(() => defaultEnabledModules())
      : Promise.resolve(defaultEnabledModules()),
  ]);

  const { widgetIds, isReadOnlyPresident } = composeDashboardWidgets(
    user,
    unitId ?? '',
    enabledModules,
  );
  const hasWidget = (id: (typeof widgetIds)[number]) => widgetIds.includes(id);
  const skipWriteCtas = user.role === 'manager' || isReadOnlyPresident;
  const canApproveRegister =
    !skipWriteCtas && unitId ? userHasCapability(user, 'messing.approve', unitId) : false;

  const displayName = profile?.display_name ?? profile?.full_name ?? user.displayName ?? user.email;
  const greetingName = displayName.includes('@') ? displayName.split('@')[0] : displayName;

  const showMobileStrip =
    !skipWriteCtas &&
    (userHasCapability(user, 'rooms.booking.write', unitId) ||
      canApproveRegister ||
      userHasCapability(user, 'ration.issue', unitId));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Officer portal</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {greetingName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {unit ? `${unit.name} (${unit.code})` : 'No unit assigned'}
            {profile?.rank ? ` · ${profile.rank}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasWidget('secretary-approvals') || hasWidget('billing-period') ? (
            <SecretaryShortcuts readOnly={skipWriteCtas} />
          ) : (
            <>
              <Button size="sm" asChild>
                <Link href="/messing">Messing</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/billing">Bills</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {showMobileStrip ? (
        <MobileActionStrip
          canRooms={!skipWriteCtas && userHasCapability(user, 'rooms.booking.write', unitId)}
          canApprove={canApproveRegister}
          canRation={!skipWriteCtas && userHasCapability(user, 'ration.issue', unitId)}
        />
      ) : null}

      <Suspense fallback={<DashboardSkeleton compact />}>
        <DashboardPanels
          user={user}
          unitId={unitId}
          widgetIds={widgetIds}
          skipWriteCtas={skipWriteCtas}
          roleLabel={ROLE_LABEL[user.role]}
          displayName={displayName}
          email={user.email}
          rank={profile?.rank ?? null}
          serviceNo={profile?.service_no ?? null}
          diningIn={profile?.dining_in ?? null}
        />
      </Suspense>
    </div>
  );
}
