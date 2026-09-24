'use client';

import { savingLabel } from '@/components/shared/save-submit';

import { useEffect, useState } from 'react';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormError } from '@/components/shared/form-error';
import {
  CreditCard,
  Banknote,
  ReceiptText,
  Printer,
  AlertCircle,
  Building2,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch } from '@/lib/redux/hooks';
import {
  bookingUpserted,
  fetchBookingDetail,
} from '@/lib/redux/guest-rooms';
import {
  checkOutAction,
  fetchBookingWithBillAction,
  fetchHostProfilesAction,
  syncBarChitsToRoomBillAction,
} from '@/lib/guest-rooms/actions';
import type {
  Booking,
  BookingWithBill,
  HostProfile,
} from '@/lib/guest-rooms/types';
import type { SettlementType } from '@/lib/schemas/guest-rooms';
import {
  categoryLabel,
  formatHost,
  folioTotal,
  inr,
  lineTotal,
  partitionFolioItems,
  resolveGuestFoodPerNight,
  settlementLabel,
} from './folio-helpers';

interface CheckoutDialogProps {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
  unitId: string;
  guestFoodPerNight?: number;
  onSuccess?: (booking: Booking) => void;
}

const categoryLabels: Record<string, string> = {
  MEMBER_GUEST: "Member's Personal Guest",
  TRANSIT_OFFICER: 'Transit Officer (Official / TD)',
  OFFICIAL_DELEGATION: 'Official Delegation / VIP',
  OUTSIDE_CIVILIAN: 'Outside Civilian / Reciprocal Club',
};

export function CheckoutDialog({
  open,
  onClose,
  booking,
  unitId,
  guestFoodPerNight,
  onSuccess,
}: CheckoutDialogProps) {
  const dispatch = useAppDispatch();

  const [bookingDetail, setBookingDetail] = useState<BookingWithBill | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [hostProfiles, setHostProfiles] = useState<HostProfile[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string>('');
  const [settledBooking, setSettledBooking] = useState<Booking | null>(null);

  const [settlementType, setSettlementType] =
    useState<SettlementType>('DIRECT_SETTLEMENT');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [completedFolio, setCompletedFolio] = useState<{
    folioNumber: string;
    totalAmount: number;
    settlementType: SettlementType;
    paymentMethod: string | null;
    paymentReference: string | null;
    guestName: string;
    guestRank: string | null;
    roomName: string;
    checkIn: string;
    checkOut: string;
    hostName: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open || !booking) {
      setBookingDetail(null);
      setCompletedFolio(null);
      setCheckoutError(null);
      setSettledBooking(null);
      return;
    }

    setSettlementType(booking.settlement_type ?? 'DIRECT_SETTLEMENT');
    setSelectedHostId(booking.host_profile_id ?? '');
    setPaymentMethod('cash');
    setPaymentReference('');
    setCompletedFolio(null);
    setCheckoutError(null);
    setSettledBooking(null);

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const syncResult = await syncBarChitsToRoomBillAction(booking.id);
        if (cancelled) return;
        if (syncResult?.error) {
          setCheckoutError(syncResult.error);
          toast.error(syncResult.error);
        }

        const [billRes, hostsRes] = await Promise.all([
          fetchBookingWithBillAction(booking.id),
          fetchHostProfilesAction(unitId),
        ]);
        if (cancelled) return;
        if (billRes.data) {
          setBookingDetail(billRes.data);
          setPaidAmount(
            String(folioTotal(billRes.data.bill?.items ?? [], billRes.data.bill?.orders ?? [])),
          );
        }
        if (hostsRes.data) {
          setHostProfiles(hostsRes.data);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load checkout details';
          setCheckoutError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, booking, unitId]);

  if (!booking) return null;

  const bill = bookingDetail?.bill ?? null;
  const { root: flatItems, bar: barItems } = partitionFolioItems(
    bill?.items ?? [],
  );
  const orders = bill?.orders ?? [];
  const total = folioTotal(bill?.items ?? [], orders);

  const effectiveHost =
    hostProfiles.find(
      (h) => h.id === (selectedHostId || booking.host_profile_id),
    ) ?? booking.host_profile;
  const hostName = formatHost(effectiveHost);
  const foodTariff = resolveGuestFoodPerNight(
    guestFoodPerNight,
    bookingDetail?.unit ?? booking.unit,
  );

  const handlePrint = () => {
    window.print();
  };

  function handleDismiss() {
    if (completedFolio && booking) {
      onSuccess?.(settledBooking ?? booking);
    }
    onClose();
  }

  async function handleConfirmCheckout() {
    if (!booking) return;
    setCheckoutError(null);

    if (settlementType === 'CHARGE_TO_HOST') {
      const hostId = selectedHostId || booking.host_profile_id;
      if (!hostId) {
        const message =
          'A sponsoring host officer must be assigned to transfer to mess bill.';
        setCheckoutError(message);
        toast.error(message);
        return;
      }
    }

    setPending(true);
    try {
      const syncResult = await syncBarChitsToRoomBillAction(booking.id);
      if (syncResult?.error) {
        setCheckoutError(syncResult.error);
        toast.error(syncResult.error);
        return;
      }

      const refreshed = await fetchBookingWithBillAction(booking.id);
      if (refreshed.data) {
        setBookingDetail(refreshed.data);
      }
      const latestTotal = refreshed.data
        ? folioTotal(
            refreshed.data.bill?.items ?? [],
            refreshed.data.bill?.orders ?? [],
          )
        : total;

      const result = await checkOutAction({
        booking_id: booking.id,
        settlement_type: settlementType,
        host_profile_id: selectedHostId || null,
        payment_method:
          settlementType === 'DIRECT_SETTLEMENT' ? paymentMethod : null,
        payment_reference:
          settlementType === 'DIRECT_SETTLEMENT'
            ? paymentReference.trim() || null
            : null,
        paid_amount:
          settlementType === 'DIRECT_SETTLEMENT'
            ? Number(paidAmount) || latestTotal
            : 0,
      });

      if ('error' in result && result.error) {
        setCheckoutError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(
        settlementType === 'DIRECT_SETTLEMENT'
          ? 'Check-out completed & payment recorded'
          : 'Check-out completed & charges transferred to host mess bill',
      );

      if ('data' in result && result.data) {
        dispatch(bookingUpserted(result.data));
        setSettledBooking(result.data);
      }

      try {
        await dispatch(fetchBookingDetail(booking.id));
      } catch {
        // Folio voucher can still render from local state.
      }

      const settledBill = refreshed.data?.bill;
      const folioNum =
        settledBill?.folio_number ??
        `FOLIO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${booking.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

      setCompletedFolio({
        folioNumber: folioNum,
        totalAmount: latestTotal,
        settlementType,
        paymentMethod:
          settlementType === 'DIRECT_SETTLEMENT' ? paymentMethod : null,
        paymentReference:
          settlementType === 'DIRECT_SETTLEMENT'
            ? paymentReference.trim() || null
            : null,
        guestName: booking.guest_name,
        guestRank: booking.guest_rank,
        roomName: booking.room?.name ?? 'Room',
        checkIn: booking.check_in_date,
        checkOut: booking.check_out_date,
        hostName,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Check-out failed';
      setCheckoutError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={handleDismiss}
      title={
        completedFolio
          ? 'Guest Folio Settlement Voucher'
          : 'Guest Check-out & Folio Settlement'
      }
      description={
        completedFolio
          ? 'Check-out completed. Print or save the settlement voucher below.'
          : 'Verify charges, choose payment settlement mode, and finalize departure.'
      }
      contentClassName="sm:max-w-2xl max-h-[92vh] overflow-y-auto"
      footer={
        completedFolio ? (
          <div className="flex w-full items-center justify-between">
            <Button variant="outline" onClick={handlePrint} className="gap-1.5">
              <Printer className="size-4" />
              Print Voucher
            </Button>
            <Button onClick={handleDismiss}>Done</Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCheckout}
              disabled={pending || loading}
              className="gap-1.5 font-medium"
            >
              {savingLabel(
                pending,
                settlementType === 'DIRECT_SETTLEMENT' ? (
                <>
                  <CreditCard className="size-4" />
                  Settle & Check-out ({inr(total)})
                </>
              ) : (
                <>
                  <ReceiptText className="size-4" />
                  Transfer to Mess Bill ({inr(total)})
                </>
              ),
              )}
            </Button>
          </div>
        )
      }
    >
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading billing folio details...
        </div>
      ) : completedFolio ? (
        <div className="space-y-6 py-2">
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm print:border-foreground print:p-0 print:shadow-none">
            <div className="border-b border-border pb-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Officers&apos; Mess
              </p>
              <h2 className="text-xl font-bold tracking-tight text-foreground font-heading">
                GUEST ROOM SETTLEMENT VOUCHER
              </h2>
              <div className="mt-2 flex items-center justify-center gap-3 text-xs font-mono text-muted-foreground">
                <span>
                  Folio: <strong>{completedFolio.folioNumber}</strong>
                </span>
                <span>•</span>
                <span>Date: {new Date().toLocaleDateString('en-IN')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 text-xs border-b border-border">
              <div>
                <span className="text-muted-foreground uppercase font-semibold block text-[10px]">
                  Guest Name
                </span>
                <span className="font-semibold text-foreground text-sm">
                  {completedFolio.guestRank
                    ? `${completedFolio.guestRank} `
                    : ''}
                  {completedFolio.guestName}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground uppercase font-semibold block text-[10px]">
                  Room Allotted
                </span>
                <span className="font-semibold text-foreground text-sm">
                  {completedFolio.roomName}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground uppercase font-semibold block text-[10px]">
                  Stay Period
                </span>
                <span className="text-foreground">
                  {completedFolio.checkIn} to {completedFolio.checkOut}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground uppercase font-semibold block text-[10px]">
                  Settlement Type
                </span>
                <Badge
                  variant={
                    completedFolio.settlementType === 'DIRECT_SETTLEMENT'
                      ? 'default'
                      : 'secondary'
                  }
                  className="text-[10px]"
                >
                  {completedFolio.settlementType === 'DIRECT_SETTLEMENT'
                    ? `Direct (${completedFolio.paymentMethod?.toUpperCase() ?? 'CASH'})`
                    : 'Transferred to Monthly Mess Bill'}
                </Badge>
              </div>
              <div className="col-span-2 rounded bg-muted/40 p-2 text-xs">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                  Sponsoring Host Officer
                </span>
                <span className="font-medium text-foreground">
                  {completedFolio.hostName ?? '—'}
                </span>
              </div>
            </div>

            <div className="py-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Itemized Charges
              </h4>
              <div className="space-y-1.5 text-xs">
                {flatItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-1 border-b border-border/40"
                  >
                    <span>
                      {item.description}{' '}
                      <span className="text-muted-foreground">
                        ({categoryLabel(item.category)}
                        {Number(item.quantity) > 1
                          ? ` · x${item.quantity}`
                          : ''}
                        )
                      </span>
                    </span>
                    <span className="font-mono font-medium">
                      {inr(lineTotal(item))}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t-2 border-border pt-3">
                <span className="text-sm font-bold text-foreground">
                  Total Settled
                </span>
                <span className="font-heading text-lg font-bold text-foreground tabular-nums">
                  {inr(completedFolio.totalAmount)}
                </span>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-8 pt-8 border-t border-border text-center text-xs">
              <div>
                <div className="border-t border-dashed border-border pt-1 font-medium text-foreground">
                  Guest Signature
                </div>
              </div>
              <div>
                <div className="border-t border-dashed border-border pt-1 font-medium text-foreground">
                  Mess Havildar / Secretary
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 py-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground text-base">
                  {booking.guest_rank ? `${booking.guest_rank} ` : ''}
                  {booking.guest_name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Room: <strong>{booking.room?.name}</strong> • Stay:{' '}
                  {booking.check_in_date} to {booking.check_out_date}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-xs">
                  {categoryLabels[booking.booking_category ?? 'MEMBER_GUEST'] ??
                    booking.booking_category}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {settlementLabel(settlementType)}
                </Badge>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs">
              <UserCheck className="size-3.5 text-primary shrink-0" />
              <span className="text-muted-foreground">Sponsoring Host:</span>
              <span className="font-medium text-foreground">
                {hostName ?? '—'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Folio Charges Breakdown
              </h4>
              <span className="text-xs font-medium text-muted-foreground">
                {flatItems.length} item{flatItems.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="rounded-md border border-border bg-background divide-y divide-border text-sm">
              {flatItems.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No billed items found for this room stay.
                </div>
              ) : (
                flatItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3.5 py-2.5"
                  >
                    <div>
                      <p className="font-medium text-foreground text-xs">
                        {item.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {categoryLabel(item.category)} • Rate:{' '}
                        {inr(Number(item.amount))} × {item.quantity}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {inr(lineTotal(item))}
                    </span>
                  </div>
                ))
              )}
            </div>

            {barItems.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Includes {barItems.length} bar line
                {barItems.length === 1 ? '' : 's'} posted from guest chits.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No bar charges on this folio.
              </p>
            )}

            {foodTariff != null ? (
              <p className="text-[11px] text-muted-foreground">
                Unit guest food tariff: {inr(foodTariff)} / night
              </p>
            ) : null}

            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-foreground">
                Total Due:
              </span>
              <span className="font-heading text-xl font-bold text-foreground tabular-nums">
                {inr(total)}
              </span>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold text-foreground">
                Settlement Method
              </Label>
              <p className="text-xs text-muted-foreground">
                Select how this guest bill will be cleared.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSettlementType('DIRECT_SETTLEMENT')}
                className={`relative flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition-all cursor-pointer ${
                  settlementType === 'DIRECT_SETTLEMENT'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Banknote className="size-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">
                    Direct Payment
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Guest settles bill directly on checkout via Cash, UPI QR, or
                  Card.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSettlementType('CHARGE_TO_HOST')}
                className={`relative flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition-all cursor-pointer ${
                  settlementType === 'CHARGE_TO_HOST'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">
                    Transfer to Mess Bill
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Charge transferred to sponsoring officer&apos;s monthly mess
                  account.
                </p>
              </button>
            </div>

            {settlementType === 'DIRECT_SETTLEMENT' && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Payment Mode</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={setPaymentMethod}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash (Mess Counter)</SelectItem>
                        <SelectItem value="upi">UPI / QR Code</SelectItem>
                        <SelectItem value="card">Debit / Credit Card</SelectItem>
                        <SelectItem value="netbanking">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Paid Amount (₹)</Label>
                    <Input
                      type="number"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="h-9 text-xs font-mono"
                      placeholder="Amount paid"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Transaction / Receipt Reference (Optional)
                  </Label>
                  <Input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. UPI Ref / UTR / Cash Receipt # / Card Auth"
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {settlementType === 'CHARGE_TO_HOST' && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Sponsoring Host Officer{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedHostId || booking.host_profile_id || ''}
                    onValueChange={setSelectedHostId}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select sponsoring officer" />
                    </SelectTrigger>
                    <SelectContent>
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

                <div className="rounded-md bg-accent/40 p-2.5 text-xs text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="size-4 text-primary shrink-0 mt-0.5" />
                  <p>
                    The full folio amount of <strong>{inr(total)}</strong> will
                    be automatically included in the host officer&apos;s monthly
                    mess bill during cycle computation (26th to 25th).
                  </p>
                </div>
              </div>
            )}
          </div>

          <FormError message={checkoutError} />
        </div>
      )}
    </AdaptiveModal>
  );
}
