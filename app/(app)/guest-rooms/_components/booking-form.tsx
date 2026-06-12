'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormError } from '@/components/shared/form-error';
import type { Booking } from '@/lib/guest-rooms/types';
import type {
  CreateBookingInput,
  UpdateBookingInput,
} from '@/lib/schemas/guest-rooms';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import {
  availabilityKey,
  createBooking,
  fetchAvailableRooms,
  selectAvailability,
  selectGuestRoomsRequest,
  updateBooking,
} from '@/lib/redux/guest-rooms';

interface BookingFormProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  booking?: Partial<Booking> | null;
}

export function BookingForm({
  open,
  onClose,
  unitId,
  booking,
}: BookingFormProps) {
  const dispatch = useAppDispatch();
  const isEditing = !!booking?.id;

  const [guestName, setGuestName] = useState(booking?.guest_name ?? '');
  const [guestRank, setGuestRank] = useState(booking?.guest_rank ?? '');
  const [guestPhone, setGuestPhone] = useState(booking?.guest_phone ?? '');
  const [guestEmail, setGuestEmail] = useState(booking?.guest_email ?? '');
  const [checkIn, setCheckIn] = useState(
    booking?.check_in_date ?? format(new Date(), 'yyyy-MM-dd'),
  );
  const [checkOut, setCheckOut] = useState(
    booking?.check_out_date ?? format(addDays(new Date(), 1), 'yyyy-MM-dd'),
  );
  const [roomId, setRoomId] = useState(booking?.room_id ?? '');
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasValidDates = useMemo(
    () => !!checkIn && !!checkOut && new Date(checkOut) > new Date(checkIn),
    [checkIn, checkOut],
  );
  const availabilityRequestKey = hasValidDates
    ? availabilityKey(unitId, checkIn, checkOut)
    : null;

  const availableRooms = useAppSelector((state) =>
    hasValidDates ? selectAvailability(state, unitId, checkIn, checkOut) : [],
  );
  const availabilityRequest = useAppSelector((state) =>
    availabilityRequestKey
      ? selectGuestRoomsRequest(state, availabilityRequestKey)
      : { status: 'idle', error: null, fetchedAt: null },
  );
  const isFetchingRooms = availabilityRequest.status === 'loading';
  const roomSelectionValid =
    !!roomId &&
    (availableRooms.some((room) => room.id === roomId) ||
      (isEditing && booking?.room_id === roomId));

  useEffect(() => {
    if (!open || !hasValidDates) return;
    dispatch(fetchAvailableRooms({ unitId, checkIn, checkOut })).catch(
      (error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to check room availability',
        );
      },
    );
  }, [checkIn, checkOut, dispatch, hasValidDates, open, unitId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!guestName.trim()) {
      setSubmitError('Guest name is required.');
      return;
    }
    if (!roomSelectionValid) {
      setSubmitError('Select an available room.');
      return;
    }
    if (!hasValidDates) {
      setSubmitError('Check-out date must be after check-in date.');
      return;
    }

    const bookingInput = {
      guest_name: guestName.trim(),
      guest_rank: guestRank.trim(),
      guest_phone: guestPhone.trim() || null,
      guest_email: guestEmail.trim() || null,
      check_in_date: checkIn,
      check_out_date: checkOut,
      room_id: roomId,
      status: (booking?.status ?? 'confirmed') as CreateBookingInput['status'],
    } satisfies Omit<CreateBookingInput, 'unit_id'>;

    setPending(true);
    try {
      if (isEditing && booking?.id) {
        await dispatch(
          updateBooking({
            id: booking.id,
            unitId,
            input: bookingInput satisfies UpdateBookingInput,
          }),
        );
        toast.success('Booking updated');
      } else {
        await dispatch(
          createBooking({
            unit_id: unitId,
            ...bookingInput,
          }),
        );
        toast.success('Booking created');
      }
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save booking';
      setSubmitError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Booking' : 'New Booking'}
      description="Enter guest details and select dates for the booking."
      footer={
        <Button
          type="submit"
          form="booking-form"
          disabled={pending || isFetchingRooms || !roomSelectionValid}
          className="press"
        >
          {pending
            ? 'Saving...'
            : isEditing
              ? 'Update Booking'
              : 'Confirm Booking'}
        </Button>
      }
    >
      <form id="booking-form" onSubmit={handleSubmit} className="py-6 space-y-4">
        <input type="hidden" name="room_id" value={roomId} />

        <div className="space-y-1.5">
          <Label htmlFor="guest_name" className="text-sm font-medium">
            Guest Name
          </Label>
          <Input
            id="guest_name"
            name="guest_name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Full name of the guest"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="guest_rank" className="text-sm font-medium">
            Guest Rank / Designation
          </Label>
          <Input
            id="guest_rank"
            name="guest_rank"
            value={guestRank}
            onChange={(e) => setGuestRank(e.target.value)}
            placeholder="e.g. Major, Director"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="guest_phone" className="text-sm font-medium">
              Guest Phone (Optional)
            </Label>
            <Input
              id="guest_phone"
              name="guest_phone"
              value={guestPhone ?? ''}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest_email" className="text-sm font-medium">
              Guest Email (Optional)
            </Label>
            <Input
              id="guest_email"
              name="guest_email"
              type="email"
              value={guestEmail ?? ''}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="e.g. guest@example.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="check_in_date" className="text-sm font-medium">
              Check-in Date
            </Label>
            <Input
              id="check_in_date"
              name="check_in_date"
              type="date"
              value={checkIn}
              onChange={(e) => {
                setCheckIn(e.target.value);
                if (!isEditing) setRoomId('');
              }}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="check_out_date" className="text-sm font-medium">
              Check-out Date
            </Label>
            <Input
              id="check_out_date"
              name="check_out_date"
              type="date"
              value={checkOut}
              onChange={(e) => {
                setCheckOut(e.target.value);
                if (!isEditing) setRoomId('');
              }}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="room_id" className="text-sm font-medium">
            Select Room
          </Label>
          <Select
            value={roomId}
            onValueChange={setRoomId}
            disabled={isFetchingRooms || !hasValidDates}
          >
            <SelectTrigger id="room_id">
              <SelectValue
                placeholder={
                  isFetchingRooms
                    ? 'Checking availability...'
                    : 'Select a room'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableRooms.length === 0 && !isFetchingRooms ? (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  No rooms available for these dates
                </div>
              ) : null}
              {availableRooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name} ({room.room_type}) - ₹
                  {Number(room.nightly_rate).toLocaleString('en-IN')}/night
                </SelectItem>
              ))}
              {isEditing &&
              booking?.room_id &&
              !availableRooms.find((room) => room.id === booking.room_id) ? (
                <SelectItem key={booking.room_id} value={booking.room_id}>
                  {booking.room?.name ?? 'Current room'} (Current Room)
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>

        <FormError message={submitError ?? availabilityRequest.error} />
      </form>
    </AdaptiveModal>
  );
}
