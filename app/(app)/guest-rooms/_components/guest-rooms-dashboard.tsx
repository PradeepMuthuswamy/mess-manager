'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  BedDouble,
  CalendarCheck,
  CalendarClock,
  DoorOpen,
  LogIn,
  LogOut,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import {
  bookingActionKey,
  bookingSelectors,
  bookingsRangeKey,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
  closeBillDialog,
  closeBookingDetails,
  closeBookingForm,
  closeRoomForm,
  deleteBooking,
  fetchBookingDetail,
  fetchBookingsRange,
  fetchRooms,
  furnitureSelectors,
  hydrateGuestRoomsSnapshot,
  openBillDialog,
  openBookingDetails,
  openBookingForm,
  openRoomForm,
  roomSelectors,
  roomsKey,
  selectBookingDetail,
  selectGuestRoomsRequest,
  selectGuestRoomsSummary,
  selectGuestRoomsUi,
  selectIsBookingRangeLoaded,
  selectIsRequestLoading,
  selectPendingActions,
  selectTodayWorklist,
  selectVisibleBookings,
  setBookingSearch,
  setCalendarMonth,
  setGuestRoomsTab,
  setRoomSearch,
  undoCheckInBooking,
  undoCheckOutBooking,
  type GuestRoomsSnapshot,
} from '@/lib/redux/guest-rooms';
import type { Booking } from '@/lib/guest-rooms/types';
import { BookingsCalendar } from './bookings-calendar';
import { BookingsList } from './bookings-list';
import { BookingDetailsDialog } from './booking-details-dialog';
import { BookingForm } from './booking-form';
import { BillingDialog } from './billing-dialog';
import { RoomsTable } from './rooms-table';
import { RoomForm } from './room-form';

function monthDate(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(year, monthIndex - 1, 1);
}

function monthValue(date: Date) {
  return format(date, 'yyyy-MM-01');
}

function displayUpdatedAt(value: string | null) {
  if (!value) return 'Not synced yet';
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GuestRoomsDashboard({
  unitId,
  initialSnapshot,
}: {
  unitId: string;
  initialSnapshot: GuestRoomsSnapshot;
}) {
  const dispatch = useAppDispatch();
  const hydratedKey = useRef<string | null>(null);
  const initialRangeKey = bookingsRangeKey(
    initialSnapshot.unitId,
    initialSnapshot.range.from,
    initialSnapshot.range.to,
  );

  const ui = useAppSelector(selectGuestRoomsUi);
  const cursor = useMemo(() => monthDate(ui.calendarMonth), [ui.calendarMonth]);
  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
    [cursor],
  );
  const gridEnd = useMemo(
    () => endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),
    [cursor],
  );
  const from = format(gridStart, 'yyyy-MM-dd');
  const to = format(gridEnd, 'yyyy-MM-dd');
  const rangeKey = bookingsRangeKey(unitId, from, to);

  const rooms = useAppSelector(roomSelectors.selectAll);
  const furnitureCatalogue = useAppSelector(furnitureSelectors.selectAll);
  const bookings = useAppSelector((state) =>
    selectVisibleBookings(state, from, to),
  );
  const summary = useAppSelector(selectGuestRoomsSummary);
  const worklist = useAppSelector(selectTodayWorklist);
  const pendingActions = useAppSelector(selectPendingActions);
  const isRangeLoaded = useAppSelector((state) =>
    selectIsBookingRangeLoaded(state, rangeKey),
  );
  const loadingBookings = useAppSelector((state) =>
    selectIsRequestLoading(state, rangeKey),
  );
  const loadingRooms = useAppSelector((state) =>
    selectIsRequestLoading(state, roomsKey(unitId)),
  );
  const bookingRequest = useAppSelector((state) =>
    selectGuestRoomsRequest(state, rangeKey),
  );
  const selectedBooking = useAppSelector((state) =>
    ui.selectedBookingId
      ? bookingSelectors.selectById(state, ui.selectedBookingId) ?? null
      : null,
  );
  const selectedRoom = useAppSelector((state) =>
    ui.selectedRoomId
      ? roomSelectors.selectById(state, ui.selectedRoomId) ?? null
      : null,
  );
  const bookingWithBill = useAppSelector((state) =>
    selectBookingDetail(state, ui.billBookingId),
  );

  useEffect(() => {
    const key = `${initialSnapshot.unitId}:${initialSnapshot.range.from}:${initialSnapshot.range.to}:${initialSnapshot.fetchedAt}`;
    if (hydratedKey.current === key) return;
    hydratedKey.current = key;
    dispatch(hydrateGuestRoomsSnapshot(initialSnapshot));
    dispatch(setCalendarMonth(monthValue(new Date())));
  }, [dispatch, initialSnapshot]);

  useEffect(() => {
    if (rangeKey === initialRangeKey && !isRangeLoaded) return;
    if (isRangeLoaded || loadingBookings) return;
    dispatch(fetchBookingsRange({ unitId, from, to })).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to load bookings');
    });
  }, [
    dispatch,
    from,
    initialRangeKey,
    isRangeLoaded,
    loadingBookings,
    rangeKey,
    to,
    unitId,
  ]);

  async function runBookingAction(
    action: () => Promise<Booking | void>,
    message: string,
  ) {
    try {
      await action();
      toast.success(message);
      dispatch(closeBookingDetails());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    }
  }

  const handleCheckIn = (bookingId: string) =>
    runBookingAction(
      () => dispatch(checkInBooking(unitId, bookingId)),
      'Checked in',
    );

  const handleCheckOut = (bookingId: string) =>
    runBookingAction(
      () => dispatch(checkOutBooking(unitId, bookingId)),
      'Checked out',
    );

  const handleCancel = (bookingId: string) => {
    if (!confirm('Cancel this booking?')) return;
    runBookingAction(
      () => dispatch(cancelBooking(unitId, bookingId)),
      'Booking cancelled',
    );
  };

  const handleUndoCheckIn = (bookingId: string) =>
    runBookingAction(
      () => dispatch(undoCheckInBooking(unitId, bookingId)),
      'Check-in reverted',
    );

  const handleUndoCheckOut = (bookingId: string) =>
    runBookingAction(
      () => dispatch(undoCheckOutBooking(unitId, bookingId)),
      'Check-out reverted',
    );

  const handleDeleteBooking = (bookingId: string) => {
    if (!confirm('Delete this booking and its bill records?')) return;
    runBookingAction(
      () => dispatch(deleteBooking(unitId, bookingId)),
      'Booking deleted',
    );
  };

  async function handleViewBill(booking: Booking) {
    dispatch(openBillDialog(booking.id));
    try {
      await dispatch(fetchBookingDetail(booking.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load bill');
    }
  }

  function handleNewBooking(dates?: { checkIn: string; checkOut: string }) {
    dispatch(openBookingForm(dates ? {
      check_in_date: dates.checkIn,
      check_out_date: dates.checkOut,
    } : null));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_24rem]">
        <OperationalSummary summary={summary} />
        <TodayWorklist
          worklist={worklist}
          pendingActions={pendingActions}
          onView={(booking) => dispatch(openBookingDetails(booking.id))}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={ui.activeTab}
          onValueChange={(value) =>
            dispatch(setGuestRoomsTab(value as typeof ui.activeTab))
          }
          className="w-full sm:w-auto"
        >
          <TabsList>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {loadingBookings || loadingRooms ? 'Refreshing...' : `Last updated ${displayUpdatedAt(ui.lastUpdatedAt)}`}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              dispatch(fetchBookingsRange({ unitId, from, to, force: true })).catch((error) => {
                toast.error(error instanceof Error ? error.message : 'Failed to refresh bookings');
              });
              dispatch(fetchRooms(unitId, true)).catch((error) => {
                toast.error(error instanceof Error ? error.message : 'Failed to refresh rooms');
              });
            }}
          >
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={() => handleNewBooking()}>
            <Plus className="mr-1.5 size-4" />
            New Booking
          </Button>
        </div>
      </div>

      {bookingRequest.status === 'failed' ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {bookingRequest.error}
        </div>
      ) : null}

      {ui.activeTab === 'calendar' ? (
        <BookingsCalendar
          bookings={bookings}
          cursor={cursor}
          setCursor={(date) => dispatch(setCalendarMonth(monthValue(date)))}
          loading={loadingBookings}
          searchQuery={ui.bookingSearch}
          onSearchQueryChange={(value) => dispatch(setBookingSearch(value))}
          onViewBooking={(booking) => dispatch(openBookingDetails(booking.id))}
          onNewBooking={(checkInDate) => {
            const checkInStr = format(checkInDate, 'yyyy-MM-dd');
            const checkOutStr = format(
              new Date(checkInDate.getTime() + 86_400_000),
              'yyyy-MM-dd',
            );
            handleNewBooking({ checkIn: checkInStr, checkOut: checkOutStr });
          }}
        />
      ) : null}

      {ui.activeTab === 'bookings' ? (
        loadingBookings && bookings.length === 0 ? (
          <Skeleton className="h-[400px] w-full rounded-md" />
        ) : (
          <BookingsList
            bookings={bookings}
            searchQuery={ui.bookingSearch}
            onSearchQueryChange={(value) => dispatch(setBookingSearch(value))}
            pendingActions={pendingActions}
            onViewBooking={(booking) => dispatch(openBookingDetails(booking.id))}
            onEditBooking={(booking) => dispatch(openBookingForm(booking))}
            onDeleteBooking={handleDeleteBooking}
            onNewBooking={() => handleNewBooking()}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onCancel={handleCancel}
            onUndoCheckIn={handleUndoCheckIn}
            onUndoCheckOut={handleUndoCheckOut}
            onViewBill={handleViewBill}
          />
        )
      ) : null}

      {ui.activeTab === 'rooms' ? (
        loadingRooms && rooms.length === 0 ? (
          <Skeleton className="h-[400px] w-full rounded-md" />
        ) : (
          <RoomsTable
            rooms={rooms}
            searchQuery={ui.roomSearch}
            onSearchQueryChange={(value) => dispatch(setRoomSearch(value))}
            onNewRoom={() => dispatch(openRoomForm(null))}
            onEditRoom={(room) => dispatch(openRoomForm(room.id))}
          />
        )
      ) : null}

      <BookingDetailsDialog
        open={ui.dialog === 'booking-details'}
        onClose={() => dispatch(closeBookingDetails())}
        booking={selectedBooking}
        onEdit={(booking) => dispatch(openBookingForm(booking))}
        onDelete={handleDeleteBooking}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onCancel={handleCancel}
        onViewBill={handleViewBill}
        onUndoCheckIn={handleUndoCheckIn}
        onUndoCheckOut={handleUndoCheckOut}
        pendingActions={pendingActions}
      />

      <BookingForm
        key={
          ui.dialog === 'booking-form'
            ? `booking-form:${
                ui.formBooking?.id ??
                `${ui.formBooking?.check_in_date ?? 'new'}:${ui.formBooking?.check_out_date ?? ''}`
              }`
            : 'booking-form:closed'
        }
        open={ui.dialog === 'booking-form'}
        onClose={() => dispatch(closeBookingForm())}
        booking={ui.formBooking}
        unitId={unitId}
      />

      <BillingDialog
        open={ui.dialog === 'bill'}
        onClose={() => dispatch(closeBillDialog())}
        booking={bookingWithBill}
        bookingId={ui.billBookingId}
      />

      <RoomForm
        key={
          ui.dialog === 'room-form'
            ? `room-form:${ui.selectedRoomId ?? 'new'}`
            : 'room-form:closed'
        }
        open={ui.dialog === 'room-form'}
        onClose={() => dispatch(closeRoomForm())}
        room={selectedRoom}
        furnitureCatalogue={furnitureCatalogue}
        unitId={unitId}
      />
    </div>
  );
}

function OperationalSummary({
  summary,
}: {
  summary: {
    totalRooms: number;
    vacant: number;
    reserved: number;
    occupied: number;
    arrivalsToday: number;
    departuresToday: number;
  };
}) {
  const items = [
    { label: 'Rooms', value: summary.totalRooms, icon: BedDouble },
    { label: 'Vacant', value: summary.vacant, icon: DoorOpen },
    { label: 'Reserved', value: summary.reserved, icon: CalendarClock },
    { label: 'Occupied', value: summary.occupied, icon: BedDouble },
    { label: 'Arrivals', value: summary.arrivalsToday, icon: LogIn },
    { label: 'Departures', value: summary.departuresToday, icon: LogOut },
  ];

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarCheck className="size-4 text-primary" />
        <h2 className="font-heading text-sm font-semibold text-foreground">
          Room desk
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <Icon className="size-3.5 text-muted-foreground" />
            </div>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TodayWorklist({
  worklist,
  pendingActions,
  onView,
  onCheckIn,
  onCheckOut,
}: {
  worklist: {
    arrivals: Booking[];
    departures: Booking[];
    inHouse: Booking[];
  };
  pendingActions: Record<string, true | undefined>;
  onView: (booking: Booking) => void;
  onCheckIn: (bookingId: string) => void;
  onCheckOut: (bookingId: string) => void;
}) {
  const arrivals = worklist.arrivals.slice(0, 3);
  const departures = worklist.departures.slice(0, 3);

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-semibold text-foreground">
            Today
          </h2>
          <p className="text-xs text-muted-foreground">
            {worklist.inHouse.length} in house
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <WorklistGroup
          label="Arrivals"
          bookings={arrivals}
          empty="No arrivals today"
          pendingActions={pendingActions}
          onView={onView}
          action={(booking) =>
            booking.status === 'confirmed' ? (
              <Button
                size="xs"
                disabled={pendingActions[bookingActionKey('check-in', booking.id)]}
                onClick={() => onCheckIn(booking.id)}
              >
                Check-in
              </Button>
            ) : null
          }
        />
        <WorklistGroup
          label="Departures"
          bookings={departures}
          empty="No departures today"
          pendingActions={pendingActions}
          onView={onView}
          action={(booking) =>
            booking.status === 'checked_in' ? (
              <Button
                size="xs"
                variant="outline"
                disabled={pendingActions[bookingActionKey('check-out', booking.id)]}
                onClick={() => onCheckOut(booking.id)}
              >
                Check-out
              </Button>
            ) : null
          }
        />
      </div>
    </section>
  );
}

function WorklistGroup({
  label,
  bookings,
  empty,
  pendingActions,
  onView,
  action,
}: {
  label: string;
  bookings: Booking[];
  empty: string;
  pendingActions: Record<string, true | undefined>;
  onView: (booking: Booking) => void;
  action: (booking: Booking) => ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {bookings.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        bookings.map((booking) => {
          const pending = Object.keys(pendingActions).some((key) =>
            key.endsWith(`:${booking.id}`),
          );
          return (
            <div
              key={booking.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
            >
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => onView(booking)}
              >
                <span className="block truncate text-sm font-medium text-foreground">
                  {booking.guest_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {booking.room?.name ?? 'Room'} · {booking.status.replace('_', ' ')}
                </span>
              </button>
              {pending ? (
                <span className="text-xs text-muted-foreground">Updating</span>
              ) : (
                action(booking)
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
