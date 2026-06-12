'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookingsCalendar } from './bookings-calendar';
import { BookingsList } from './bookings-list';
import { RoomsTable } from './rooms-table';
import { BookingForm } from './booking-form';
import { BookingDetailsDialog } from './booking-details-dialog';
import { BillingDialog } from './billing-dialog';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

import {
  fetchMonthBookingsAction,
  fetchRoomsAction,
  fetchUnitFurnitureAction,
  checkInAction,
  checkOutAction,
  cancelBookingAction,
  fetchBookingWithBillAction,
  undoCheckInAction,
  undoCheckOutAction,
  deleteBookingAction,
} from '@/lib/guest-rooms/actions';
import type { Booking, Room, UnitFurniture, BookingWithBill } from '@/lib/guest-rooms/types';

export function GuestRoomsDashboard({ unitId }: { unitId: string }) {
  const [activeTab, setActiveTab] = useState('calendar');
  const [cursor, setCursor] = useState<Date>(() => new Date());

  // Data State
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [furnitureCatalogue, setFurnitureCatalogue] = useState<UnitFurniture[]>([]);

  // Loading states
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refresh Trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal / Selection State
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [formBooking, setFormBooking] = useState<Booking | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBillOpen, setIsBillOpen] = useState(false);
  const [bookingWithBill, setBookingWithBill] = useState<BookingWithBill | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  // Visible grid start/end for month queries
  const gridStart = useMemo(() => startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }), [cursor]);
  const gridEnd = useMemo(() => endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }), [cursor]);

  // Load Bookings when cursor or refreshKey changes
  useEffect(() => {
    let active = true;
    async function loadBookings() {
      setLoadingBookings(true);
      const from = format(gridStart, 'yyyy-MM-dd');
      const to = format(gridEnd, 'yyyy-MM-dd');
      const res = await fetchMonthBookingsAction(unitId, from, to);
      if (!active) return;
      if (res.error) {
        console.error('Failed to fetch bookings:', res.error);
        toast.error(res.error || 'Failed to fetch bookings');
      } else {
        setBookings(res.data ?? []);
      }
      setLoadingBookings(false);
    }
    loadBookings();
    return () => {
      active = false;
    };
  }, [unitId, gridStart, gridEnd, refreshKey]);

  // Load Rooms and Furniture Catalogue once or when refreshKey changes
  useEffect(() => {
    let active = true;
    async function loadRoomsAndFurniture() {
      setLoadingRooms(true);
      try {
        const [roomsRes, furnitureRes] = await Promise.all([
          fetchRoomsAction(unitId),
          fetchUnitFurnitureAction(unitId),
        ]);
        if (!active) return;
        if (roomsRes.error) {
          setError(roomsRes.error);
        } else {
          setRooms(roomsRes.data ?? []);
        }
        if (furnitureRes.error) {
          console.error('Failed to load furniture:', furnitureRes.error);
        } else {
          setFurnitureCatalogue(furnitureRes.data ?? []);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load rooms');
        }
      } finally {
        if (active) setLoadingRooms(false);
      }
    }
    loadRoomsAndFurniture();
    return () => {
      active = false;
    };
  }, [unitId, refreshKey]);

  // Actions
  const handleCheckIn = async (bookingId: string) => {
    startTransition(async () => {
      const res = await checkInAction(bookingId);
      if (res.ok) {
        toast.success('Checked in successfully');
        handleRefresh();
        setSelectedBooking(null);
      } else {
        toast.error(res.error || 'Check-in failed');
      }
    });
  };

  const handleCheckOut = async (bookingId: string) => {
    startTransition(async () => {
      const res = await checkOutAction(bookingId);
      if (res.ok) {
        toast.success('Checked out successfully');
        handleRefresh();
        setSelectedBooking(null);
      } else {
        toast.error(res.error || 'Check-out failed');
      }
    });
  };

  const handleCancel = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    startTransition(async () => {
      const res = await cancelBookingAction(bookingId);
      if (res.ok) {
        toast.success('Booking cancelled successfully');
        handleRefresh();
        setSelectedBooking(null);
      } else {
        toast.error(res.error || 'Cancellation failed');
      }
    });
  };

  const handleUndoCheckIn = async (bookingId: string) => {
    startTransition(async () => {
      const res = await undoCheckInAction(bookingId);
      if (res.ok) {
        toast.success('Check-in reverted successfully');
        handleRefresh();
        setSelectedBooking(null);
      } else {
        toast.error(res.error || 'Failed to undo check-in');
      }
    });
  };

  const handleUndoCheckOut = async (bookingId: string) => {
    startTransition(async () => {
      const res = await undoCheckOutAction(bookingId);
      if (res.ok) {
        toast.success('Check-out reverted successfully');
        handleRefresh();
        setSelectedBooking(null);
      } else {
        toast.error(res.error || 'Failed to undo check-out');
      }
    });
  };

  const handleViewBill = async (booking: Booking) => {
    const res = await fetchBookingWithBillAction(booking.id);
    if (res.data) {
      setBookingWithBill(res.data);
      setIsBillOpen(true);
    } else {
      toast.error(res.error || 'Failed to fetch bill details');
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    if (!confirm('Are you sure you want to delete this booking? All associated bills will be permanently deleted.')) return;
    startTransition(async () => {
      const res = await deleteBookingAction(bookingId);
      if (res.ok) {
        toast.success('Booking deleted successfully');
        handleRefresh();
        setSelectedBooking(null);
      } else {
        toast.error(res.error || 'Failed to delete booking');
      }
    });
  };

  const handleViewBooking = (booking: Booking) => {
    setSelectedBooking(booking);
  };

  const handleEditBooking = (booking: Booking) => {
    setFormBooking(booking);
    setIsFormOpen(true);
    setSelectedBooking(null);
  };

  const handleNewBooking = (dates?: { checkIn: string; checkOut: string }) => {
    if (dates) {
      setFormBooking({
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
      } as Booking);
    } else {
      setFormBooking(null);
    }
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <BookingsCalendar
            bookings={bookings}
            cursor={cursor}
            setCursor={setCursor}
            loading={loadingBookings}
            onViewBooking={handleViewBooking}
            onNewBooking={(checkInDate) => {
              const checkInStr = format(checkInDate, 'yyyy-MM-dd');
              const checkOutStr = format(new Date(checkInDate.getTime() + 86400000), 'yyyy-MM-dd');
              handleNewBooking({ checkIn: checkInStr, checkOut: checkOutStr });
            }}
          />
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          {loadingBookings && bookings.length === 0 ? (
            <Skeleton className="h-[400px] w-full rounded-md" />
          ) : (
            <BookingsList
              bookings={bookings}
              onRefresh={handleRefresh}
              onViewBooking={handleViewBooking}
              onEditBooking={handleEditBooking}
              onDeleteBooking={handleDeleteBooking}
              onNewBooking={() => handleNewBooking()}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onCancel={handleCancel}
              onUndoCheckIn={handleUndoCheckIn}
              onUndoCheckOut={handleUndoCheckOut}
              onViewBill={handleViewBill}
            />
          )}
        </TabsContent>

        <TabsContent value="rooms" className="mt-4">
          {loadingRooms ? (
            <Skeleton className="h-[400px] w-full rounded-md" />
          ) : (
            <RoomsTable
              rooms={rooms}
              furnitureCatalogue={furnitureCatalogue}
              onRefresh={handleRefresh}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Shared Modals */}
      <BookingDetailsDialog
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
        onEdit={handleEditBooking}
        onDelete={handleDeleteBooking}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onCancel={handleCancel}
        onViewBill={handleViewBill}
        onUndoCheckIn={handleUndoCheckIn}
        onUndoCheckOut={handleUndoCheckOut}
        isPending={isPending}
      />

      <BookingForm
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setFormBooking(null);
          handleRefresh();
        }}
        booking={formBooking}
      />

      <BillingDialog
        open={isBillOpen}
        onClose={() => {
          setIsBillOpen(false);
          setBookingWithBill(null);
          handleRefresh();
        }}
        booking={bookingWithBill}
      />
    </div>
  );
}
