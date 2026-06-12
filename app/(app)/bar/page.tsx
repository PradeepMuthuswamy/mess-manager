import { requireUser } from '@/lib/auth/require-role';
import {
  requireCapability,
  userHasCapability,
} from '@/lib/auth/require-capability';
import { EmptyState } from '@/components/shared/empty-state';
import { BarClient } from './_components/bar-client';
import {
  getBarInventory,
  listBarChits,
  listUnitMembers,
  listActiveBookings,
} from '@/lib/bar/queries';

export const dynamic = 'force-dynamic';

export default async function BarPage() {
  const user = await requireUser();
  await requireCapability('bar.read', user.activeUnitId ?? null);

  if (!user.activeUnitId) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Bar Operations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage bar chit logs, member and guest consumption, and real-time inventory levels.
          </p>
        </header>
        <EmptyState
          title="Pick a unit to continue"
          description="You're in all-units mode. Use the unit switcher in the navbar to choose a unit to view its bar records."
        />
      </section>
    );
  }

  const unitId = user.activeUnitId;
  const [inventory, recentChits, members, bookings] = await Promise.all([
    getBarInventory(unitId),
    listBarChits(unitId),
    listUnitMembers(unitId),
    listActiveBookings(unitId),
  ]);

  const canWrite = userHasCapability(user, 'bar.write', unitId);

  return (
    <BarClient
      unitId={unitId}
      inventory={inventory}
      recentChits={recentChits}
      members={members}
      bookings={bookings}
      canWrite={canWrite}
    />
  );
}
