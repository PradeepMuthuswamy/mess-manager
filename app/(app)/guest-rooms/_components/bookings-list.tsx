'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  MoreHorizontal,
  Plus,
  ReceiptText,
  LogIn,
  LogOut,
  XCircle,
  CalendarDays,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Booking } from '@/lib/guest-rooms/types';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';

interface BookingsListProps {
  bookings: Booking[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  pendingActions: Record<string, true | undefined>;
  onViewBooking?: (booking: Booking) => void;
  onEditBooking?: (booking: Booking) => void;
  onDeleteBooking?: (bookingId: string) => void;
  onNewBooking?: () => void;
  onCheckIn?: (bookingId: string) => void;
  onCheckOut?: (bookingId: string) => void;
  onCancel?: (bookingId: string) => void;
  onUndoCheckIn?: (bookingId: string) => void;
  onUndoCheckOut?: (bookingId: string) => void;
  onViewBill?: (booking: Booking) => void;
}

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const STATUS_BADGE: Record<Booking["status"], { label: string; variant: BadgeVariant }> = {
  confirmed:   { label: "Confirmed",   variant: "secondary"   },
  checked_in:  { label: "Checked In",  variant: "default"     },
  checked_out: { label: "Checked Out", variant: "outline"     },
  cancelled:   { label: "Cancelled",   variant: "destructive" },
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function nightsBetween(checkIn: string, checkOut: string) {
  const a = new Date(checkIn).getTime()
  const b = new Date(checkOut).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export function BookingsList({
  bookings,
  searchQuery,
  onSearchQueryChange,
  pendingActions,
  onViewBooking,
  onEditBooking,
  onDeleteBooking,
  onNewBooking,
  onCheckIn,
  onCheckOut,
  onCancel,
  onUndoCheckIn,
  onUndoCheckOut,
  onViewBill,
}: BookingsListProps) {
  const [sortField, setSortField] = useState<keyof Booking | 'room_name' | 'nights' | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const isBookingPending = (bookingId: string) =>
    Object.keys(pendingActions).some((key) => key.endsWith(`:${bookingId}`));

  // 1. Filter bookings
  const filteredBookings = bookings.filter((b) => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true

    const nameMatch = b.guest_name?.toLowerCase().includes(query)
    const rankMatch = b.guest_rank?.toLowerCase().includes(query)
    const phoneMatch = b.guest_phone?.toLowerCase().includes(query)
    const emailMatch = b.guest_email?.toLowerCase().includes(query)
    const roomMatch = b.room?.name?.toLowerCase().includes(query)
    const statusMatch = (STATUS_BADGE[b.status]?.label ?? b.status).toLowerCase().includes(query)

    return nameMatch || rankMatch || phoneMatch || emailMatch || roomMatch || statusMatch
  })

  // 2. Sort bookings
  const sortedBookings = [...filteredBookings].sort((a, b) => {
    if (!sortField) return 0

    let aVal: unknown
    let bVal: unknown

    if (sortField === 'room_name') {
      aVal = a.room?.name ?? ""
      bVal = b.room?.name ?? ""
    } else if (sortField === 'nights') {
      aVal = nightsBetween(a.check_in_date, a.check_out_date)
      bVal = nightsBetween(b.check_in_date, b.check_out_date)
    } else {
      aVal = a[sortField] ?? ""
      bVal = b[sortField] ?? ""
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal
    }

    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()

    if (aStr < bStr) return sortDirection === "asc" ? -1 : 1
    if (aStr > bStr) return sortDirection === "asc" ? 1 : -1
    return 0
  })

  // 3. Paginate bookings
  const totalPages = Math.ceil(sortedBookings.length / pageSize)
  const activePage = Math.min(currentPage, Math.max(1, totalPages))
  const startIndex = (activePage - 1) * pageSize
  const paginatedBookings = sortedBookings.slice(startIndex, startIndex + pageSize)

  const handleSort = (field: keyof Booking | 'room_name' | 'nights') => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc")
      } else {
        setSortField(null)
      }
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
    setCurrentPage(1)
  }

  const renderSortIcon = (field: keyof Booking | 'room_name' | 'nights') => {
    if (sortField !== field) return <ArrowUpDown className="ml-1.5 h-3 w-3 text-muted-foreground/50 shrink-0" />;
    return sortDirection === "asc"
      ? <ChevronUp className="ml-1.5 h-3 w-3 text-foreground shrink-0" />
      : <ChevronDown className="ml-1.5 h-3 w-3 text-foreground shrink-0" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search bookings by guest, room..."
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-8 bg-background"
          />
        </div>
        <div className="flex items-center gap-3 justify-between sm:justify-end shrink-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {searchQuery.trim()
              ? `${filteredBookings.length} of ${bookings.length} matched`
              : `${bookings.length} ${bookings.length === 1 ? "booking" : "bookings"} in view`}
          </p>
          <Button onClick={onNewBooking} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            New Booking
          </Button>
        </div>
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="No bookings in view"
          description="No guest room bookings found for this period."
          action={
            <Button size="sm" onClick={onNewBooking}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Booking
            </Button>
          }
        />
      ) : filteredBookings.length === 0 ? (
        <div className="rounded-md border border-border border-dashed p-8 text-center text-muted-foreground bg-muted/5">
          No bookings match your search query.
        </div>
      ) : (
        <div className="rounded-md border border-border shadow-sm overflow-hidden bg-background">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => handleSort('guest_name')}
                >
                  <div className="flex items-center">
                    Guest
                    {renderSortIcon('guest_name')}
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => handleSort('room_name')}
                >
                  <div className="flex items-center">
                    Room
                    {renderSortIcon('room_name')}
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors text-right"
                  onClick={() => handleSort('check_in_date')}
                >
                  <div className="flex items-center justify-end">
                    Check-In
                    {renderSortIcon('check_in_date')}
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors text-right"
                  onClick={() => handleSort('check_out_date')}
                >
                  <div className="flex items-center justify-end">
                    Check-Out
                    {renderSortIcon('check_out_date')}
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors text-right"
                  onClick={() => handleSort('nights')}
                >
                  <div className="flex items-center justify-end">
                    Nights
                    {renderSortIcon('nights')}
                  </div>
                </TableHead>
                <TableHead
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Status
                    {renderSortIcon('status')}
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedBookings.map((booking) => {
                const statusMeta = STATUS_BADGE[booking.status] ?? { label: booking.status, variant: "outline" as BadgeVariant }
                const nights = nightsBetween(booking.check_in_date, booking.check_out_date)
                const isPending = isBookingPending(booking.id)
                return (
                  <TableRow
                    key={booking.id}
                    className={cn(
                      'border-t border-border transition-opacity',
                      isPending && 'opacity-70',
                    )}
                  >
                    <TableCell className="py-2 px-3">
                      <button
                        onClick={() => onViewBooking?.(booking)}
                        disabled={isPending}
                        className="font-medium text-sm text-foreground hover:underline text-left cursor-pointer focus:outline-none"
                      >
                        {booking.guest_name}
                      </button>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={isPending}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                            <span className="sr-only">
                              {isPending ? 'Updating' : `Open menu for ${booking.guest_name}`}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onViewBooking?.(booking)}>
                            <CalendarDays className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEditBooking?.(booking)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit Booking
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDeleteBooking?.(booking.id)}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Booking
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {booking.status === "confirmed" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => onCheckIn?.(booking.id)}
                              >
                                <LogIn className="mr-2 h-4 w-4" />
                                Check-in
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onCancel?.(booking.id)}
                              >
                                <XCircle className="mr-2 h-4 w-4 text-destructive" />
                                <span className="text-destructive">Cancel Booking</span>
                              </DropdownMenuItem>
                            </>
                          )}
                          {booking.status === "checked_in" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => onCheckOut?.(booking.id)}
                              >
                                <LogOut className="mr-2 h-4 w-4" />
                                Check-out
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onUndoCheckIn?.(booking.id)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Undo Check-in
                              </DropdownMenuItem>
                            </>
                          )}
                          {booking.status === "checked_out" && (
                            <DropdownMenuItem
                              onClick={() => onUndoCheckOut?.(booking.id)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Undo Check-out
                            </DropdownMenuItem>
                          )}
                          {(booking.status === "checked_in" || booking.status === "checked_out") && (
                            <DropdownMenuItem onClick={() => onViewBill?.(booking)}>
                              <ReceiptText className="mr-2 h-4 w-4" />
                              Manage Bill
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground font-medium">
            Showing {startIndex + 1} to {Math.min(startIndex + pageSize, sortedBookings.length)} of {sortedBookings.length} bookings
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={activePage === 1}
              className="h-8 cursor-pointer"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground font-medium px-2">
              Page {activePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={activePage === totalPages}
              className="h-8 cursor-pointer"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
