'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import {
  LogIn,
  LogOut,
  ReceiptText,
  XCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Booking } from '@/lib/guest-rooms/types';
import { bookingActionKey } from '@/lib/redux/guest-rooms/slice';
import { savingLabel } from '@/components/shared/save-submit';
import { formatHost, settlementLabel } from './folio-helpers';

interface BookingDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
  onEdit: (booking: Booking) => void;
  onDelete: (bookingId: string) => void;
  onCheckIn: (bookingId: string) => void;
  onCheckOut: (bookingId: string) => void;
  onCancel: (bookingId: string) => void;
  onViewBill: (booking: Booking) => void;
  onUndoCheckIn: (bookingId: string) => void;
  onUndoCheckOut: (bookingId: string) => void;
  pendingActions: Record<string, true | undefined>;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function BookingDetailsDialog({
  open,
  onClose,
  booking,
  onEdit,
  onDelete,
  onCheckIn,
  onCheckOut,
  onCancel,
  onViewBill,
  onUndoCheckIn,
  onUndoCheckOut,
  pendingActions,
}: BookingDetailsDialogProps) {
  if (!booking) return null;

  const isPending = Object.keys(pendingActions).some((key) =>
    key.endsWith(`:${booking.id}`),
  );
  const actionPending = (action: string) =>
    Boolean(pendingActions[bookingActionKey(action, booking.id)]);

  const nights = Math.max(
    1,
    Math.round(
      (new Date(booking.check_out_date).getTime() -
        new Date(booking.check_in_date).getTime()) /
        86400000
    )
  );

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Booking Details"
      description="View status and manage operations for this guest booking."
      contentClassName="sm:max-w-xl"
    >
      <div className="space-y-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground font-heading">
              {booking.guest_name}
            </h3>
            {booking.guest_rank && (
              <p className="text-sm text-muted-foreground font-medium">
                {booking.guest_rank}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge
              variant={
                booking.status === 'confirmed'
                  ? 'secondary'
                  : booking.status === 'checked_in'
                    ? 'default'
                    : booking.status === 'checked_out'
                      ? 'outline'
                      : 'destructive'
              }
              className="capitalize text-xs font-semibold px-2 py-0.5"
            >
              {booking.status.replace('_', ' ')}
            </Badge>
            <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5">
              {settlementLabel(booking.settlement_type)}
            </Badge>
          </div>
        </div>

        {/* Clean, simple grid layout for booking metadata */}
        <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 text-sm py-2">
          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
              Room
            </span>
            <span className="font-medium text-foreground">
              {booking.room?.name || '—'}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
              Stay Duration
            </span>
            <span className="font-medium text-foreground">
              {fmtDate(booking.check_in_date)} - {fmtDate(booking.check_out_date)}{' '}
              <span className="text-xs text-muted-foreground font-normal">
                ({nights} night{nights === 1 ? '' : 's'})
              </span>
            </span>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
              Guest Category
            </span>
            <span className="font-medium text-foreground">
              {booking.booking_category === 'MEMBER_GUEST'
                ? "Member's Personal Guest"
                : booking.booking_category === 'TRANSIT_OFFICER'
                  ? 'Transit Officer (Official / TD)'
                  : booking.booking_category === 'OFFICIAL_DELEGATION'
                    ? 'Official Delegation / VIP'
                    : booking.booking_category === 'OUTSIDE_CIVILIAN'
                      ? 'Outside Civilian / Reciprocal'
                      : (booking.booking_category ?? 'Standard Guest')}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
              Settlement Preference
            </span>
            <span className="font-medium text-foreground">
              {booking.settlement_type === 'CHARGE_TO_HOST'
                ? 'Charge to Host Mess Bill'
                : 'Direct Payment at Departure'}
            </span>
          </div>

          <div className="col-span-2 rounded bg-muted/40 p-2.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
              Sponsoring Host Officer
            </span>
            <span className="font-semibold text-foreground text-xs">
              {formatHost(booking.host_profile) ?? '—'}
            </span>
          </div>

          {booking.guest_phone && (
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                Phone
              </span>
              <span className="font-medium text-foreground">
                {booking.guest_phone}
              </span>
            </div>
          )}

          {booking.guest_email && (
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                Email
              </span>
              <span className="font-medium text-foreground truncate block">
                {booking.guest_email}
              </span>
            </div>
          )}

          {booking.special_requests && (
            <div className="col-span-2 rounded bg-accent/30 p-2.5 text-xs">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                Special Requests / Instructions
              </span>
              <span className="text-foreground">
                {booking.special_requests}
              </span>
            </div>
          )}

          {booking.actual_check_in && (
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                Checked In At
              </span>
              <span className="font-medium text-foreground">
                {new Date(booking.actual_check_in).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </span>
            </div>
          )}

          {booking.actual_check_out && (
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                Checked Out At
              </span>
              <span className="font-medium text-foreground">
                {new Date(booking.actual_check_out).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </span>
            </div>
          )}
        </div>

        {/* Action Button Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => onEdit(booking)}
              className="cursor-pointer h-8 px-2.5"
              title="Edit Booking"
            >
              <Pencil className="size-3.5" />
              <span className="ml-1.5 text-xs">Edit</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => onDelete(booking.id)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer h-8 px-2.5"
              title="Delete Booking"
            >
              <Trash2 className="size-3.5" />
              <span className="ml-1.5 text-xs">
                {savingLabel(actionPending('delete'), 'Delete')}
              </span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {booking.status === 'confirmed' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onCancel(booking.id)}
                  className="text-destructive hover:bg-destructive/5 h-8 text-xs cursor-pointer"
                >
                  {savingLabel(
                    actionPending('cancel'),
                    <>
                      <XCircle className="mr-1.5 size-3.5" />
                      Cancel
                    </>,
                  )}
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => onCheckIn(booking.id)}
                  className="h-8 text-xs cursor-pointer font-medium"
                >
                  {savingLabel(
                    actionPending('check-in'),
                    <>
                      <LogIn className="mr-1.5 size-3.5" />
                      Check-in
                    </>,
                  )}
                </Button>
              </>
            )}

            {booking.status === 'checked_in' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onUndoCheckIn(booking.id)}
                  className="h-8 text-xs cursor-pointer"
                >
                  {savingLabel(actionPending('undo-check-in'), 'Undo Check-in')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onViewBill(booking)}
                  className="h-8 text-xs cursor-pointer"
                >
                  <ReceiptText className="mr-1.5 size-3.5" />
                  Manage Bill
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => onCheckOut(booking.id)}
                  className="h-8 text-xs cursor-pointer font-medium"
                >
                  <LogOut className="mr-1.5 size-3.5" />
                  Check-out
                </Button>
              </>
            )}

            {booking.status === 'checked_out' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onUndoCheckOut(booking.id)}
                  className="h-8 text-xs cursor-pointer"
                >
                  {savingLabel(actionPending('undo-check-out'), 'Undo Check-out')}
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => onViewBill(booking)}
                  className="h-8 text-xs cursor-pointer font-medium"
                >
                  <ReceiptText className="mr-1.5 size-3.5" />
                  View Bill
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </AdaptiveModal>
  );
}
