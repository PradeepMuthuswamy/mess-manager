import { getCurrentUser } from '@/lib/auth/get-current-user';
import { requireCapability } from '@/lib/auth/require-capability';
import { GuestRoomsDashboard } from './_components/guest-rooms-dashboard';
import { EmptyState } from '@/components/shared/empty-state';
import { DoorClosed } from 'lucide-react';
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import {
  getBookings,
  getRooms,
  getUnitFurniture,
} from '@/lib/guest-rooms/queries';

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

  const today = new Date();
  const gridStart = startOfWeek(startOfMonth(today), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(today), { weekStartsOn: 0 });
  const from = format(gridStart, 'yyyy-MM-dd');
  const to = format(gridEnd, 'yyyy-MM-dd');
  const [rooms, bookings, furniture] = await Promise.all([
    getRooms(user.activeUnitId),
    getBookings(user.activeUnitId, from, to),
    getUnitFurniture(user.activeUnitId),
  ]);

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

      <GuestRoomsDashboard
        unitId={user.activeUnitId}
        initialSnapshot={{
          unitId: user.activeUnitId,
          range: { from, to },
          rooms,
          bookings,
          furniture,
          fetchedAt: new Date().toISOString(),
        }}
      />
    </div>
  );
}
