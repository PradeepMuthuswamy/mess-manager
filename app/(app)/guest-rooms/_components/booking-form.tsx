"use client"

import { useActionState, useEffect, useState } from "react"
import { AdaptiveModal } from "@/components/shared/adaptive-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createBookingAction, updateBookingAction, fetchAvailableRoomsAction } from "@/lib/guest-rooms/actions"
import type { Booking, Room } from "@/lib/guest-rooms/types"
import { format, addDays } from "date-fns"
import { FormError } from "@/components/shared/form-error"

interface BookingFormProps {
  open: boolean
  onClose: () => void
  unitId: string
  booking?: Booking | null
}

export function BookingForm({ open, onClose, unitId, booking }: BookingFormProps) {
  const isEditing = !!booking
  
  const [guestName, setGuestName] = useState("")
  const [guestRank, setGuestRank] = useState("")
  const [checkIn, setCheckIn] = useState("")
  const [checkOut, setCheckOut] = useState("")
  const [roomId, setRoomId] = useState("")
  const [availableRooms, setAvailableRooms] = useState<Room[]>([])
  const [isFetchingRooms, setIsFetchingRooms] = useState(false)

  // Initialize form state when opening or when booking changes
  useEffect(() => {
    if (!open) return;
    
    if (booking) {
      setGuestName(booking.guest_name)
      setGuestRank(booking.guest_rank ?? "")
      setCheckIn(booking.check_in_date)
      setCheckOut(booking.check_out_date)
      setRoomId(booking.room_id)
    } else {
      setGuestName("")
      setGuestRank("")
      setCheckIn(format(new Date(), 'yyyy-MM-dd'))
      setCheckOut(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
      setRoomId("")
    }
  }, [booking, open])

  useEffect(() => {
    if (!open) return

    async function updateAvailableRooms() {
      if (!checkIn || !checkOut) return
      if (new Date(checkOut) <= new Date(checkIn)) {
        setAvailableRooms([]);
        return;
      }

      setIsFetchingRooms(true)
      const res = await fetchAvailableRoomsAction(unitId, checkIn, checkOut)
      if (res.data) {
        setAvailableRooms(res.data as Room[])
      }
      setIsFetchingRooms(false)
    }

    updateAvailableRooms()
  }, [unitId, checkIn, checkOut, open])

  const [state, formAction, pending] = useActionState(
    async (_prevState: { ok?: boolean; error?: string } | null, formData: FormData) => {
      const data = {
        unit_id: unitId,
        guest_name: formData.get("guest_name") as string,
        guest_rank: formData.get("guest_rank") as string,
        check_in_date: formData.get("check_in_date") as string,
        check_out_date: formData.get("check_out_date") as string,
        room_id: formData.get("room_id") as string,
        status: (booking?.status ?? 'confirmed') as 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled'
      }

      if (isEditing && booking) {
        return await updateBookingAction(booking.id, data)
      } else {
        return await createBookingAction(data)
      }
    },
    null
  )

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEditing ? "Booking updated" : "Booking created")
      onClose()
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, onClose, isEditing])

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Booking" : "New Booking"}
      description="Enter guest details and select dates for the booking."
      footer={
        <Button
          type="submit"
          form="booking-form"
          disabled={pending || isFetchingRooms || !roomId}
          className="press"
        >
          {pending ? "Saving..." : (isEditing ? "Update Booking" : "Confirm Booking")}
        </Button>
      }
    >
      <form id="booking-form" action={formAction} className="py-6 space-y-4">
          <input type="hidden" name="room_id" value={roomId} />

          <div className="space-y-1.5">
            <Label htmlFor="guest_name" className="text-sm font-medium">Guest Name</Label>
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
            <Label htmlFor="guest_rank" className="text-sm font-medium">Guest Rank / Designation</Label>
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
              <Label htmlFor="check_in_date" className="text-sm font-medium">Check-in Date</Label>
              <Input
                id="check_in_date"
                name="check_in_date"
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="check_out_date" className="text-sm font-medium">Check-out Date</Label>
              <Input
                id="check_out_date"
                name="check_out_date"
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="room_id" className="text-sm font-medium">Select Room</Label>
            <Select value={roomId} onValueChange={setRoomId} disabled={isFetchingRooms}>
              <SelectTrigger id="room_id">
                <SelectValue placeholder={isFetchingRooms ? "Checking availability..." : "Select a room"} />
              </SelectTrigger>
              <SelectContent>
                {availableRooms.length === 0 && !isFetchingRooms && (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No rooms available for these dates
                  </div>
                )}
                {availableRooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name} ({room.room_type}) - ₹{Number(room.nightly_rate)}/night
                  </SelectItem>
                ))}
                {isEditing && booking && !availableRooms.find(r => r.id === booking.room_id) && (
                  <SelectItem key={booking.room_id} value={booking.room_id}>
                    {booking.room?.name} (Current Room)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <FormError message={state?.error} />
        </form>
    </AdaptiveModal>
  )
}
