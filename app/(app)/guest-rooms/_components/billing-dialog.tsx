'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { savingLabel } from '@/components/shared/save-submit';
import {
  addBillItemAction,
  deleteBillItemAction,
  syncBarChitsToRoomBillAction,
  updateBillItemAction,
} from '@/lib/guest-rooms/actions';
import type { BookingWithBill } from '@/lib/guest-rooms/types';
import { useAppDispatch } from '@/lib/redux/hooks';
import { fetchBookingDetail } from '@/lib/redux/guest-rooms';
import {
  categoryLabel,
  formatHost,
  inr,
  lineTotal,
  partitionFolioItems,
  folioTotal,
  resolveGuestFoodPerNight,
  settlementLabel,
} from './folio-helpers';

interface BillingDialogProps {
  open: boolean;
  onClose: () => void;
  booking: BookingWithBill | null;
  bookingId: string | null;
  guestFoodPerNight?: number;
}

export function BillingDialog({
  open,
  onClose,
  booking,
  bookingId,
  guestFoodPerNight,
}: BillingDialogProps) {
  const dispatch = useAppDispatch();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      syncedFor.current = null;
      return;
    }
    const id = booking?.id ?? bookingId;
    if (!id || syncedFor.current === id) return;
    if (booking?.bill && booking.bill.status !== 'draft') {
      syncedFor.current = id;
      return;
    }
    if (!booking?.bill) return;
    syncedFor.current = id;

    let cancelled = false;
    (async () => {
      const syncResult = await syncBarChitsToRoomBillAction(id);
      if (cancelled) return;
      if (syncResult?.error) {
        toast.error(syncResult.error);
        return;
      }
      try {
        await dispatch(fetchBookingDetail(id));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to refresh folio',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, booking?.id, booking?.bill, bookingId, dispatch]);

  if (!booking) {
    if (!open) return null;

    return (
      <AdaptiveModal
        open={open}
        onClose={onClose}
        title="Guest Bill"
        description={bookingId ? 'Loading booking bill...' : 'No booking selected'}
        contentClassName="sm:max-w-4xl max-h-[90vh]"
        footer={
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        }
      >
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Loading bill details...
        </p>
      </AdaptiveModal>
    );
  }

  return (
    <BillingDialogContent
      key={billVersionKey(booking)}
      open={open}
      onClose={onClose}
      booking={booking}
      guestFoodPerNight={guestFoodPerNight}
    />
  );
}

function billVersionKey(booking: BookingWithBill) {
  const bill = booking.bill;
  if (!bill) return `${booking.id}:no-bill`;
  const itemVersion = (bill.items ?? [])
    .map(
      (item) =>
        `${item.id}:${item.category}:${item.amount}:${item.quantity}:${item.description}`,
    )
    .join('|');
  const orderVersion = (bill.orders ?? [])
    .map((order) => `${order.id}:${order.items?.length ?? 0}`)
    .join('|');
  return `${booking.id}:${bill.status}:${itemVersion}:${orderVersion}`;
}

function BillingDialogContent({
  open,
  onClose,
  booking,
  guestFoodPerNight,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingWithBill;
  guestFoodPerNight?: number;
}) {
  const dispatch = useAppDispatch();
  const [pending, startTransition] = useTransition();

  const bill = booking.bill ?? null;
  const isDraft = bill?.status === 'draft';
  const { rent, food, bar, other } = partitionFolioItems(bill?.items ?? []);
  const orders = bill?.orders ?? [];
  const hostName = formatHost(booking.host_profile);
  const foodTariff = resolveGuestFoodPerNight(
    guestFoodPerNight,
    booking.unit,
  );
  const defaultFoodRate =
    foodTariff != null ? String(foodTariff) : food ? String(food.amount) : '';

  const [roomRentAmount, setRoomRentAmount] = useState(
    rent ? String(rent.amount) : '0',
  );
  const [roomRentQty, setRoomRentQty] = useState(
    rent ? String(rent.quantity) : '0',
  );
  const [foodAmount, setFoodAmount] = useState(defaultFoodRate);
  const [foodQty, setFoodQty] = useState(food ? String(food.quantity) : '0');
  const [extra_, setExtra] = useState({
    description: '',
    amount: '',
    quantity: '1',
  });

  const total = folioTotal(bill?.items ?? [], orders);

  async function refreshCurrent() {
    await dispatch(fetchBookingDetail(booking.id));
  }

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(ok);
      try {
        await refreshCurrent();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to refresh bill',
        );
      }
    });
  }

  const handleUpdatePermanentItems = async () => {
    if (!bill) return;
    startTransition(async () => {
      try {
        if (rent) {
          const rentRes = await updateBillItemAction(
            rent.id,
            Number(roomRentAmount) || 0,
            Number(roomRentQty) || 0,
          );
          if ('error' in rentRes && rentRes.error) {
            toast.error(rentRes.error);
            return;
          }
        }
        if (food) {
          const foodRes = await updateBillItemAction(
            food.id,
            Number(foodAmount) || 0,
            Number(foodQty) || 0,
          );
          if ('error' in foodRes && foodRes.error) {
            toast.error(foodRes.error);
            return;
          }
        }
        toast.success('Rates and quantities updated successfully');
        await refreshCurrent();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update rates');
      }
    });
  };

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Guest Bill"
      description={`${booking.guest_name} · Room ${booking.room?.name ?? ''}`}
      contentClassName="sm:max-w-4xl max-h-[90vh]"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-6 py-4">
        {!bill ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No bill yet. A draft bill is created when the guest checks in.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={isDraft ? 'secondary' : 'default'}
                    className="capitalize"
                  >
                    {bill.status}
                  </Badge>
                  <Badge variant="outline">
                    {settlementLabel(
                      bill.settlement_type ?? booking.settlement_type,
                    )}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Host:{' '}
                  <span className="font-medium text-foreground">
                    {hostName ?? '—'}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total
                </p>
                <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
                  {inr(total)}
                </p>
              </div>
            </div>

            <section className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground font-heading">
                Accommodation & Food Rates
              </h4>

              <div className="rounded-lg border border-border overflow-hidden bg-background">
                <div className="grid grid-cols-12 gap-3 bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground border-b uppercase tracking-wider">
                  <div className="col-span-5">Item Description</div>
                  <div className="col-span-2 text-right">Rate (₹)</div>
                  <div className="col-span-2 text-right">Quantity</div>
                  <div className="col-span-3 text-right">Total (₹)</div>
                </div>

                <div className="divide-y divide-border">
                  <div className="grid grid-cols-12 gap-3 px-4 py-3 items-center">
                    <div className="col-span-5 text-sm font-medium text-foreground">
                      Accommodation (Room Rent)
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        className="text-right h-8 text-sm"
                        disabled={!isDraft || pending}
                        value={roomRentAmount}
                        onChange={(e) => setRoomRentAmount(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        className="text-right h-8 text-sm"
                        disabled={!isDraft || pending}
                        value={roomRentQty}
                        onChange={(e) => setRoomRentQty(e.target.value)}
                      />
                    </div>
                    <div className="col-span-3 text-right font-mono text-sm font-semibold text-foreground">
                      {inr(
                        Number(roomRentAmount || 0) * Number(roomRentQty || 0),
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-3 px-4 py-3 items-center">
                    <div className="col-span-5">
                      <p className="text-sm font-medium text-foreground">
                        Food (All Meals Included)
                      </p>
                      {foodTariff != null ? (
                        <p className="text-[11px] text-muted-foreground">
                          Unit guest food tariff: {inr(foodTariff)} / night
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        className="text-right h-8 text-sm"
                        disabled={!isDraft || pending}
                        value={foodAmount}
                        onChange={(e) => setFoodAmount(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        className="text-right h-8 text-sm"
                        disabled={!isDraft || pending}
                        value={foodQty}
                        onChange={(e) => setFoodQty(e.target.value)}
                      />
                    </div>
                    <div className="col-span-3 text-right font-mono text-sm font-semibold text-foreground">
                      {inr(Number(foodAmount || 0) * Number(foodQty || 0))}
                    </div>
                  </div>
                </div>
              </div>

              {isDraft && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={handleUpdatePermanentItems}
                  >
                    {savingLabel(pending, 'Save Rates & Stay')}
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground font-heading">
                Bar
              </h4>
              {bar.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  No bar charges posted to this folio.
                </p>
              ) : (
                <div className="space-y-2">
                  {bar.map((item) => (
                    <Row
                      key={item.id}
                      label={item.description}
                      meta={`${categoryLabel(item.category)} · ${item.quantity} × ${inr(Number(item.amount))}`}
                      value={inr(lineTotal(item))}
                      pending={pending}
                    />
                  ))}
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground font-heading">
                Additional Charges
              </h4>

              <div className="space-y-2">
                {other.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    No additional charges recorded.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {other.map((item) => (
                      <Row
                        key={item.id}
                        label={item.description}
                        meta={`${categoryLabel(item.category)} · ${item.quantity} × ${inr(Number(item.amount))}`}
                        value={inr(lineTotal(item))}
                        onDelete={
                          isDraft
                            ? () =>
                                run(
                                  () => deleteBillItemAction(item.id),
                                  'Item removed',
                                )
                            : undefined
                        }
                        pending={pending}
                      />
                    ))}
                  </div>
                )}
              </div>

              {isDraft && (
                <div className="grid grid-cols-12 gap-3 items-center rounded-lg border border-dashed border-border p-4 bg-muted/5">
                  <div className="col-span-7">
                    <Input
                      placeholder="Charge description (e.g. Laundry, Damage, Extra Bed)"
                      value={extra_.description}
                      onChange={(e) =>
                        setExtra({ ...extra_, description: e.target.value })
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      placeholder="Amount (₹)"
                      value={extra_.amount}
                      onChange={(e) =>
                        setExtra({ ...extra_, amount: e.target.value })
                      }
                      className="h-9 text-sm text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      size="sm"
                      className="w-full h-9"
                      disabled={
                        pending || !extra_.description.trim() || !extra_.amount
                      }
                      onClick={() =>
                        run(async () => {
                          const r = await addBillItemAction(bill.id, {
                            category: 'misc',
                            description: extra_.description,
                            amount: Number(extra_.amount),
                            quantity: 1,
                          });
                          if (r.ok) {
                            setExtra({
                              description: '',
                              amount: '',
                              quantity: '1',
                            });
                          }
                          return r;
                        }, 'Charge added')
                      }
                    >
                      {savingLabel(
                        pending,
                        <>
                          <Plus className="mr-1.5 h-4 w-4 shrink-0" />
                          Add
                        </>,
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-muted-foreground">
                Total due
              </span>
              <span className="font-heading text-2xl font-bold tabular-nums text-foreground">
                {inr(total)}
              </span>
            </div>
          </>
        )}
      </div>
    </AdaptiveModal>
  );
}

function Row({
  label,
  meta,
  value,
  onDelete,
  pending,
}: {
  label: string;
  meta: string;
  value: string;
  onDelete?: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono tabular-nums text-sm text-foreground">
          {value}
        </span>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            disabled={pending}
            onClick={onDelete}
          >
            {savingLabel(
              pending,
              <>
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">Remove {label}</span>
              </>,
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
