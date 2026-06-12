'use client';

import { useState, useTransition } from 'react';
import { AdaptiveModal } from "@/components/shared/adaptive-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  addBillItemAction,
  deleteBillItemAction,
  updateBillItemAction,
} from "@/lib/guest-rooms/actions"
import type { BookingWithBill } from "@/lib/guest-rooms/types"
import { useAppDispatch } from '@/lib/redux/hooks';
import { fetchBookingDetail } from '@/lib/redux/guest-rooms';

interface BillingDialogProps {
  open: boolean
  onClose: () => void
  booking: BookingWithBill | null
  bookingId: string | null
}

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function lineTotal(i: { amount: number | string; quantity: number | string }) {
  return Number(i.amount) * Number(i.quantity)
}

export function BillingDialog({
  open,
  onClose,
  booking,
  bookingId,
}: BillingDialogProps) {
  if (!booking) {
    if (!open) return null

    return (
      <AdaptiveModal
        open={open}
        onClose={onClose}
        title="Guest Bill"
        description={bookingId ? "Loading booking bill..." : "No booking selected"}
        contentClassName="sm:max-w-4xl max-h-[90vh]"
        footer={<Button variant="outline" onClick={onClose}>Close</Button>}
      >
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Loading bill details...
        </p>
      </AdaptiveModal>
    )
  }

  return (
    <BillingDialogContent
      key={billVersionKey(booking)}
      open={open}
      onClose={onClose}
      booking={booking}
    />
  )
}

function billVersionKey(booking: BookingWithBill) {
  const bill = booking.bill
  if (!bill) return `${booking.id}:no-bill`
  const itemVersion = (bill.items ?? [])
    .map((item) => `${item.id}:${item.amount}:${item.quantity}:${item.description}`)
    .join('|')
  const orderVersion = (bill.orders ?? [])
    .map((order) => `${order.id}:${order.items?.length ?? 0}`)
    .join('|')
  return `${booking.id}:${bill.status}:${itemVersion}:${orderVersion}`
}

function BillingDialogContent({
  open,
  onClose,
  booking,
}: {
  open: boolean
  onClose: () => void
  booking: BookingWithBill
}) {
  const dispatch = useAppDispatch()
  const [pending, startTransition] = useTransition()

  const bill = booking.bill ?? null
  const isDraft = bill?.status === "draft"
  const flat = bill?.items ?? []
  const orders = bill?.orders ?? []

  const rentItem = flat.find((i) => i.category === "room_rent")
  const baseFoodItem = flat.find((i) => i.category === "food" && i.meal_type === null)

  // Form states for permanent entries
  const [roomRentAmount, setRoomRentAmount] = useState(
    rentItem ? String(rentItem.amount) : "0",
  )
  const [roomRentQty, setRoomRentQty] = useState(
    rentItem ? String(rentItem.quantity) : "0",
  )
  const [foodAmount, setFoodAmount] = useState(
    baseFoodItem ? String(baseFoodItem.amount) : "900",
  )
  const [foodQty, setFoodQty] = useState(
    baseFoodItem ? String(baseFoodItem.quantity) : "0",
  )

  // Form state for dynamic misc entries
  const [extra_, setExtra] = useState({ description: "", amount: "", quantity: "1" })

  // Miscellaneous extra items: anything that isn't the primary rent item or the primary base food item
  const miscItems = flat.filter(
    (i) => i.id !== rentItem?.id && i.id !== baseFoodItem?.id
  )

  const total =
    flat.reduce((s, i) => s + lineTotal(i), 0) +
    orders.reduce(
      (s, o) => s + (o.items ?? []).reduce((t, i) => t + lineTotal(i), 0),
      0,
    )

  async function refreshCurrent() {
    await dispatch(fetchBookingDetail(booking.id))
  }

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(ok)
      try {
        await refreshCurrent()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to refresh bill")
      }
    })
  }

  const handleUpdatePermanentItems = async () => {
    if (!bill) return
    startTransition(async () => {
      try {
        if (rentItem) {
          await updateBillItemAction(rentItem.id, Number(roomRentAmount) || 0, Number(roomRentQty) || 0)
        }
        if (baseFoodItem) {
          await updateBillItemAction(baseFoodItem.id, Number(foodAmount) || 0, Number(foodQty) || 0)
        }
        toast.success("Rates and quantities updated successfully")
        await refreshCurrent()
      } catch {
        toast.error("Failed to update rates")
      }
    })
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Guest Bill"
      description={`${booking.guest_name} · Room ${booking.room?.name ?? ""}`}
      contentClassName="sm:max-w-4xl max-h-[90vh]"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-6 py-4">
        {!bill ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No bill yet. A draft bill is created when the guest checks in.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Badge variant={isDraft ? "secondary" : "default"} className="capitalize">
                {bill.status}
              </Badge>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total
                </p>
                <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
                  {inr(total)}
                </p>
              </div>
            </div>

            {/* Permanent entries: Accommodation & Food */}
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
                  {/* Accommodation Row */}
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
                      {inr(Number(roomRentAmount || 0) * Number(roomRentQty || 0))}
                    </div>
                  </div>

                  {/* Food Row */}
                  <div className="grid grid-cols-12 gap-3 px-4 py-3 items-center">
                    <div className="col-span-5 text-sm font-medium text-foreground">
                      Food (All Meals Included)
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
                    {pending ? "Updating..." : "Save Rates & Stay"}
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            {/* Extra charges (key/value dynamic form) */}
            <section className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground font-heading">
                Additional Charges
              </h4>
              
              <div className="space-y-2">
                {miscItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">No additional charges recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {miscItems.map((i) => (
                      <Row
                        key={i.id}
                        label={i.description}
                        meta={`${i.quantity} × ${inr(Number(i.amount))}`}
                        value={inr(lineTotal(i))}
                        onDelete={
                          isDraft
                            ? () =>
                                run(
                                  () => deleteBillItemAction(i.id),
                                  "Item removed",
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
                      disabled={pending || !extra_.description.trim() || !extra_.amount}
                      onClick={() =>
                        run(async () => {
                          const r = await addBillItemAction(bill.id, {
                            category: "misc",
                            description: extra_.description,
                            amount: Number(extra_.amount),
                            quantity: 1,
                          })
                          if (r.ok) {
                            setExtra({
                              description: "",
                              amount: "",
                              quantity: "1",
                            })
                          }
                          return r
                        }, "Charge added")
                      }
                    >
                      <Plus className="mr-1.5 h-4 w-4 shrink-0" />
                      Add
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
  )
}

function Row({
  label,
  meta,
  value,
  onDelete,
  pending,
}: {
  label: string
  meta: string
  value: string
  onDelete?: () => void
  pending: boolean
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
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Remove {label}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
