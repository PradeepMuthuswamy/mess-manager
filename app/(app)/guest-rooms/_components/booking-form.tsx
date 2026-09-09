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
import type { Booking, HostProfile } from '@/lib/guest-rooms/types';
import type {
  CreateBookingInput,
  UpdateBookingInput,
  BookingCategory,
  SettlementType,
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
import { fetchHostProfilesAction } from '@/lib/guest-rooms/actions';
import { AlertCircle } from 'lucide-react';
import { inr, resolveGuestFoodPerNight } from './folio-helpers';

interface BookingFormProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  booking?: Partial<Booking> | null;
  guestFoodPerNight?: number;
}

export function BookingForm({
  open,
  onClose,
  unitId,
  booking,
  guestFoodPerNight,
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
  const [bookingCategory, setBookingCategory] = useState<BookingCategory>(
    (booking?.booking_category as BookingCategory) ?? 'MEMBER_GUEST',
  );
  const [hostProfileId, setHostProfileId] = useState(
    booking?.host_profile_id ?? '',
  );
  const [settlementType, setSettlementType] = useState<SettlementType>(
    (booking?.settlement_type as SettlementType) ?? 'DIRECT_SETTLEMENT',
  );
  const [specialRequests, setSpecialRequests] = useState(
    booking?.special_requests ?? '',
  );

  const [hostProfiles, setHostProfiles] = useState<HostProfile[]>([]);
  const [loadingHosts, setLoadingHosts] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const foodTariff = resolveGuestFoodPerNight(guestFoodPerNight, booking?.unit);

  // Sync state on open or booking prop change
  useEffect(() => {
    if (open) {
      setGuestName(booking?.guest_name ?? '');
      setGuestRank(booking?.guest_rank ?? '');
      setGuestPhone(booking?.guest_phone ?? '');
      setGuestEmail(booking?.guest_email ?? '');
      setCheckIn(booking?.check_in_date ?? format(new Date(), 'yyyy-MM-dd'));
      setCheckOut(
        booking?.check_out_date ?? format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      );
      setRoomId(booking?.room_id ?? '');
      setBookingCategory(
        (booking?.booking_category as BookingCategory) ?? 'MEMBER_GUEST',
      );
      setHostProfileId(booking?.host_profile_id ?? '');
      setSettlementType(
        (booking?.settlement_type as SettlementType) ?? 'DIRECT_SETTLEMENT',
      );
      setSpecialRequests(booking?.special_requests ?? '');
      setSubmitError(null);
    }
  }, [open, booking]);

  // Load host profiles from unit
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingHosts(true);
    fetchHostProfilesAction(unitId)
      .then((res) => {
        if (!cancelled && res.data) {
          setHostProfiles(res.data);
        }
      })
      .catch((err) => {
        console.error('Failed to load host profiles', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingHosts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, unitId]);

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
    if (settlementType === 'CHARGE_TO_HOST' && !hostProfileId) {
      setSubmitError(
        'A sponsoring host officer is required when charging to mess bill.',
      );
      return;
    }

    const bookingInput = {
      guest_name: guestName.trim(),
      guest_rank: guestRank.trim() || undefined,
      guest_phone: guestPhone.trim() || null,
      guest_email: guestEmail.trim() || null,
      check_in_date: checkIn,
      check_out_date: checkOut,
      room_id: roomId,
      status: (booking?.status ?? 'confirmed') as CreateBookingInput['status'],
      booking_category: bookingCategory,
      host_profile_id: hostProfileId || null,
      settlement_type: settlementType,
      special_requests: specialRequests.trim() || null,
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
      description="Enter guest details, category, dates, and settlement preference."
      contentClassName="sm:max-w-xl max-h-[92vh] overflow-y-auto"
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="booking-form"
            disabled={pending || isFetchingRooms || !roomSelectionValid}
            className="press font-medium"
          >
            {pending
              ? 'Saving...'
              : isEditing
                ? 'Update Booking'
                : 'Confirm Booking'}
          </Button>
        </div>
      }
    >
      <form id="booking-form" onSubmit={handleSubmit} className="py-4 space-y-4">
        <input type="hidden" name="room_id" value={roomId} />

        {/* Guest Name & Rank */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="guest_name" className="text-xs font-semibold">
              Guest Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="guest_name"
              name="guest_name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              required
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="guest_rank" className="text-xs font-semibold">
              Rank / Designation
            </Label>
            <Input
              id="guest_rank"
              name="guest_rank"
              value={guestRank}
              onChange={(e) => setGuestRank(e.target.value)}
              placeholder="e.g. Major, Col, Director"
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="guest_phone" className="text-xs font-semibold">
              Phone Number (Optional)
            </Label>
            <Input
              id="guest_phone"
              name="guest_phone"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest_email" className="text-xs font-semibold">
              Email Address (Optional)
            </Label>
            <Input
              id="guest_email"
              name="guest_email"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="guest@example.com"
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Guest Category & Sponsoring Host */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="booking_category" className="text-xs font-semibold">
                Guest Category
              </Label>
              <Select
                value={bookingCategory}
                onValueChange={(val) => {
                  setBookingCategory(val as BookingCategory);
                  if (val === 'TRANSIT_OFFICER' || val === 'OUTSIDE_CIVILIAN') {
                    // Default to direct settlement for transit and outside guests
                    setSettlementType('DIRECT_SETTLEMENT');
                  }
                }}
              >
                <SelectTrigger id="booking_category" className="h-9 text-xs">
                  <SelectValue placeholder="Select guest category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER_GUEST">
                    Member&apos;s Personal Guest
                  </SelectItem>
                  <SelectItem value="TRANSIT_OFFICER">
                    Transit Officer (Official / TD)
                  </SelectItem>
                  <SelectItem value="OFFICIAL_DELEGATION">
                    Official Delegation / VIP
                  </SelectItem>
                  <SelectItem value="OUTSIDE_CIVILIAN">
                    Outside Civilian / Reciprocal
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="host_profile_id" className="text-xs font-semibold">
                Sponsoring Host Officer
                {settlementType === 'CHARGE_TO_HOST' ? (
                  <span className="text-destructive ml-0.5">*</span>
                ) : (
                  <span className="text-muted-foreground font-normal ml-1">
                    (Optional)
                  </span>
                )}
              </Label>
              <Select
                value={hostProfileId || 'none'}
                onValueChange={(val) => setHostProfileId(val === 'none' ? '' : val)}
              >
                <SelectTrigger id="host_profile_id" className="h-9 text-xs">
                  <SelectValue
                    placeholder={
                      loadingHosts ? 'Loading officers...' : 'Select host officer'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">— No host assigned —</span>
                  </SelectItem>
                  {hostProfiles.map((hp) => (
                    <SelectItem key={hp.id} value={hp.id}>
                      {hp.rank ? `${hp.rank} ` : ''}
                      {hp.full_name}
                      {hp.service_no ? ` (${hp.service_no})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Settlement Preference */}
          <div className="space-y-1.5 pt-1 border-t border-border/50">
            <Label htmlFor="settlement_type" className="text-xs font-semibold">
              Settlement Preference
            </Label>
            <Select
              value={settlementType}
              onValueChange={(val) => setSettlementType(val as SettlementType)}
            >
              <SelectTrigger id="settlement_type" className="h-9 text-xs">
                <SelectValue placeholder="Select settlement preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DIRECT_SETTLEMENT">
                  Direct Payment at Checkout (Cash / UPI / Card)
                </SelectItem>
                <SelectItem value="CHARGE_TO_HOST">
                  Transfer to Sponsoring Officer&apos;s Mess Bill
                </SelectItem>
              </SelectContent>
            </Select>

            {settlementType === 'CHARGE_TO_HOST' && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
                <AlertCircle className="size-3.5 text-primary shrink-0" />
                Room & food charges will be charged to the sponsoring officer&apos;s
                monthly mess bill on the 25th.
              </p>
            )}
            {foodTariff != null ? (
              <p className="text-[11px] text-muted-foreground pt-1">
                Unit guest food tariff: {inr(foodTariff)} / night
              </p>
            ) : null}
          </div>
        </div>

        {/* Stay Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="check_in_date" className="text-xs font-semibold">
              Check-in Date <span className="text-destructive">*</span>
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
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="check_out_date" className="text-xs font-semibold">
              Check-out Date <span className="text-destructive">*</span>
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
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Room Selection */}
        <div className="space-y-1.5">
          <Label htmlFor="room_id" className="text-xs font-semibold">
            Select Room <span className="text-destructive">*</span>
          </Label>
          <Select
            value={roomId}
            onValueChange={setRoomId}
            disabled={isFetchingRooms || !hasValidDates}
          >
            <SelectTrigger id="room_id" className="h-9 text-xs">
              <SelectValue
                placeholder={
                  isFetchingRooms
                    ? 'Checking room availability...'
                    : 'Select an available room'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableRooms.length === 0 && !isFetchingRooms ? (
                <div className="p-2 text-xs text-muted-foreground text-center">
                  No rooms available for these dates
                </div>
              ) : null}
              {availableRooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name} ({room.room_type}) — ₹
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

        {/* Special Requests */}
        <div className="space-y-1.5">
          <Label htmlFor="special_requests" className="text-xs font-semibold">
            Special Requests / Notes (Optional)
          </Label>
          <Input
            id="special_requests"
            name="special_requests"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            placeholder="e.g. VIP protocol, late arrival, extra mattress"
            className="h-9 text-xs"
          />
        </div>

        <FormError message={submitError ?? availabilityRequest.error} />
      </form>
    </AdaptiveModal>
  );
}
