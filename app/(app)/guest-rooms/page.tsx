import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { requireCapability } from '@/lib/auth/require-capability';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookingsCalendar } from './_components/bookings-calendar';
import { BookingsTable } from './_components/bookings-table';
import { RoomsList } from './_components/rooms-list';

import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { DoorClosed } from 'lucide-react';

export default async function GuestRoomsPage() {
  await requireCapability('rooms.read');
  const user = await getCurrentUser();
  const canManageRoomTypes = user?.role === 'admin' || user?.role === 'unit_admin';

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

      <Tabs defaultValue="calendar" className="w-full">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>

        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-md" />}>
            <BookingsCalendar unitId={user.activeUnitId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
            <BookingsTable unitId={user.activeUnitId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="rooms" className="mt-4">
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
            <RoomsList unitId={user.activeUnitId} />
          </Suspense>
        </TabsContent>


      </Tabs>
    </div>
  );
}
