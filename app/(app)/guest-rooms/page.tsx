import { getCurrentUser } from '@/lib/auth/get-current-user';
import { requireCapability } from '@/lib/auth/require-capability';
import { GuestRoomsDashboard } from './_components/guest-rooms-dashboard';
import { EmptyState } from '@/components/shared/empty-state';
import { DoorClosed } from 'lucide-react';

export default async function GuestRoomsPage() {
  await requireCapability('rooms.read');
  const user = await getCurrentUser();

  if (!user || !user.activeUnitId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Guest Rooms
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage room inventory, bookings, and billing.
          </p>
        </div>
        <EmptyState
          icon={<DoorClosed className="size-5" />}
          title="No active unit"
          description="Select a unit from the navbar to manage guest rooms."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Guest Rooms
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage room inventory, bookings, and billing.
          </p>
        </div>
      </div>

      <GuestRoomsDashboard unitId={user.activeUnitId} />
    </div>
  );
}
