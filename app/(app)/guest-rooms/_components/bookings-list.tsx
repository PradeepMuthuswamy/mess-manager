"use client"

import { useState, useTransition } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Plus, ReceiptText, LogIn, LogOut, XCircle, CalendarDays } from "lucide-react"
import type { Booking, BookingWithBill } from "@/lib/guest-rooms/types"
import {
  checkInAction,
  checkOutAction,
  cancelBookingAction,
  fetchBookingWithBillAction
} from "@/lib/guest-rooms/actions"
import { toast } from "sonner"
import { BookingForm } from "./booking-form"
import { BillingDialog } from "./billing-dialog"
import { EmptyState } from "@/components/shared/empty-state"

interface BookingsListProps {
  bookings: Booking[]
  unitId: string
}

// Map booking status to Badge variant. success/warning not yet in shadcn Badge —
// use primary/secondary/outline/destructive which are the canonical Badge variants.
type BadgeVariant = "default" | "secondary" | "outline" | "destructive"

const STATUS_BADGE: Record<Booking["status"], { label: string; variant: BadgeVariant }> = {
  confirmed:   { label: "Confirmed",   variant: "secondary"   },
  checked_in:  { label: "Checked In",  variant: "default"     },
  checked_out: { label: "Checked Out", variant: "outline"     },
  cancelled:   { label: "Cancelled",   variant: "destructive" },
}

/** Format yyyy-MM-dd to short locale string: "12 May" */
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

/** Night count between two yyyy-MM-dd strings */
function nightsBetween(checkIn: string, checkOut: string) {
  const a = new Date(checkIn).getTime()
  const b = new Date(checkOut).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function BookingsList({ bookings, unitId }: BookingsListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isBillOpen, setIsBillOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [bookingWithBill, setBookingWithBill] = useState<BookingWithBill | null>(null)
  const [, startTransition] = useTransition()

  const handleAction = async (
    action: (id: string) => Promise<{ ok?: boolean; error?: string }>,
    id: string,
    successMsg: string
  ) => {
    startTransition(async () => {
      const res = await action(id)
      if (res.ok) {
        toast.success(successMsg)
      } else {
        toast.error(res.error || "Action failed")
      }
    })
  }

  const handleViewBill = async (booking: Booking) => {
    setSelectedBooking(booking)
    const res = await fetchBookingWithBillAction(booking.id)
    if (res.data) {
      setBookingWithBill(res.data)
      setIsBillOpen(true)
    } else {
      toast.error(res.error || "Failed to fetch bill")
    }
  }

  const openNewBooking = () => {
    setSelectedBooking(null)
    setIsFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {bookings.length} {bookings.length === 1 ? "booking" : "bookings"} this month
        </p>
        <Button onClick={openNewBooking} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Booking
        </Button>
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="No bookings this month"
          description="No guest room bookings found for the current period."
          action={
            <Button size="sm" onClick={openNewBooking}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Booking
            </Button>
          }
        />
      ) : (
        <div className="rounded-md border border-border shadow-xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3">
                  Guest
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3">
                  Room
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 text-right">
                  Check-In
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 text-right">
                  Check-Out
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 text-right">
                  Nights
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => {
                const statusMeta = STATUS_BADGE[booking.status] ?? { label: booking.status, variant: "outline" as BadgeVariant }
                const nights = nightsBetween(booking.check_in_date, booking.check_out_date)
                return (
                  <TableRow key={booking.id} className="border-t border-border">
                    <TableCell className="py-2 px-3">
                      <div className="font-medium text-sm text-foreground">{booking.guest_name}</div>
                      {booking.guest_rank && (
                        <div className="text-xs text-muted-foreground">{booking.guest_rank}</div>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-sm text-muted-foreground">
                      {booking.room?.name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-mono tabular-nums text-sm text-foreground">
                      {fmtDate(booking.check_in_date)}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-mono tabular-nums text-sm text-foreground">
                      {fmtDate(booking.check_out_date)}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-mono tabular-nums text-sm text-muted-foreground">
                      {nights}
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <Badge variant={statusMeta.variant} className="text-xs">
                        {statusMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                            <span className="sr-only">Open menu for {booking.guest_name}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {booking.status === "confirmed" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleAction(checkInAction, booking.id, "Checked in successfully")}
                              >
                                <LogIn className="mr-2 h-4 w-4" />
                                Check-in
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleAction(cancelBookingAction, booking.id, "Booking cancelled")}
                              >
                                <XCircle className="mr-2 h-4 w-4 text-destructive" />
                                <span className="text-destructive">Cancel</span>
                              </DropdownMenuItem>
                            </>
                          )}
                          {booking.status === "checked_in" && (
                            <DropdownMenuItem
                              onClick={() => handleAction(checkOutAction, booking.id, "Checked out successfully")}
                            >
                              <LogOut className="mr-2 h-4 w-4" />
                              Check-out
                            </DropdownMenuItem>
                          )}
                          {(booking.status === "checked_in" || booking.status === "checked_out") && (
                            <DropdownMenuItem onClick={() => handleViewBill(booking)}>
                              <ReceiptText className="mr-2 h-4 w-4" />
                              View Bill
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <BookingForm
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        unitId={unitId}
        booking={selectedBooking}
      />

      <BillingDialog
        open={isBillOpen}
        onClose={() => setIsBillOpen(false)}
        booking={bookingWithBill}
      />
    </div>
  )
}
