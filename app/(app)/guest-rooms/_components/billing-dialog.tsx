"use client"

import { useEffect, useState, useTransition } from "react"
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
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  addBillItemAction,
  createBillOrderAction,
  deleteBillItemAction,
  deleteBillOrderAction,
  fetchBookingWithBillAction,
} from "@/lib/guest-rooms/actions"
import type { BookingWithBill } from "@/lib/guest-rooms/types"

interface BillingDialogProps {
  open: boolean
  onClose: () => void
  booking: BookingWithBill | null
}

const MEALS = ["breakfast", "lunch", "dinner"] as const
type Meal = (typeof MEALS)[number]

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function lineTotal(i: { amount: number | string; quantity: number | string }) {
  return Number(i.amount) * Number(i.quantity)
}

export function BillingDialog({ open, onClose, booking }: BillingDialogProps) {
  const [current, setCurrent] = useState<BookingWithBill | null>(booking)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) setCurrent(booking)
  }, [open, booking])

  const bill = current?.bill ?? null
  const isDraft = bill?.status === "draft"
  const flat = bill?.items ?? []
  const orders = bill?.orders ?? []

  const roomRent = flat.filter((i) => i.category === "room_rent")
  const food = flat.filter((i) => i.category === "food")
  const extra = flat.filter((i) => i.category === "misc")

  const total =
    flat.reduce((s, i) => s + lineTotal(i), 0) +
    orders.reduce(
      (s, o) => s + (o.items ?? []).reduce((t, i) => t + lineTotal(i), 0),
      0,
    )

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(ok)
      if (current) {
        const refreshed = await fetchBookingWithBillAction(current.id)
        if (refreshed.data) setCurrent(refreshed.data)
      }
    })
  }

  // --- form state ---
  const [food_, setFood] = useState({
    description: "",
    meal_type: "breakfast" as Meal,
    amount: "",
    quantity: "1",
  })
  const [extra_, setExtra] = useState({ description: "", amount: "", quantity: "1" })
  const [order_, setOrder] = useState({ label: "", occurred_at: "" })
  const [orderItem, setOrderItem] = useState<
    Record<string, { description: string; amount: string; quantity: string }>
  >({})

  if (!current) return null

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Guest Bill"
      description={`${current.guest_name} · Room ${current.room?.name ?? ""}`}
      contentClassName="sm:max-w-2xl max-h-[90vh]"
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
                <p className="font-heading text-xl font-semibold tabular-nums text-foreground">
                  {inr(total)}
                </p>
              </div>
            </div>

            {/* Room rent */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Room rent</h4>
              {roomRent.length === 0 ? (
                <p className="text-xs text-muted-foreground">No room rent recorded.</p>
              ) : (
                roomRent.map((i) => (
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
                ))
              )}
            </section>

            <Separator />

            {/* Food by meal */}
            <section className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">Food</h4>
              {MEALS.map((m) => {
                const rows = food.filter((i) => i.meal_type === m)
                if (rows.length === 0) return null
                return (
                  <div key={m} className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground capitalize">
                      {m}
                    </p>
                    {rows.map((i) => (
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
                )
              })}
              {food.length === 0 && (
                <p className="text-xs text-muted-foreground">No food charges.</p>
              )}
              {isDraft && (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-dashed border-border p-3 sm:grid-cols-4">
                  <Input
                    className="col-span-2 sm:col-span-1"
                    placeholder="Item (e.g. Omelette)"
                    value={food_.description}
                    onChange={(e) =>
                      setFood({ ...food_, description: e.target.value })
                    }
                  />
                  <Select
                    value={food_.meal_type}
                    onValueChange={(v) =>
                      setFood({ ...food_, meal_type: v as Meal })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEALS.map((m) => (
                        <SelectItem key={m} value={m} className="capitalize">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={food_.amount}
                    onChange={(e) =>
                      setFood({ ...food_, amount: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={food_.quantity}
                    onChange={(e) =>
                      setFood({ ...food_, quantity: e.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    disabled={pending || !food_.description || !food_.amount}
                    className="col-span-2 sm:col-span-4"
                    onClick={() =>
                      run(async () => {
                        const r = await addBillItemAction(bill.id, {
                          category: "food",
                          meal_type: food_.meal_type,
                          description: food_.description,
                          amount: Number(food_.amount),
                          quantity: Number(food_.quantity) || 1,
                        })
                        if (r.ok)
                          setFood({
                            description: "",
                            meal_type: food_.meal_type,
                            amount: "",
                            quantity: "1",
                          })
                        return r
                      }, "Food added")
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add food
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            {/* Adhoc orders */}
            <section className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">Adhoc orders</h4>
              {orders.length === 0 && (
                <p className="text-xs text-muted-foreground">No adhoc orders.</p>
              )}
              {orders.map((o) => {
                const oi = orderItem[o.id] ?? {
                  description: "",
                  amount: "",
                  quantity: "1",
                }
                const oTotal = (o.items ?? []).reduce(
                  (t, i) => t + lineTotal(i),
                  0,
                )
                return (
                  <div
                    key={o.id}
                    className="space-y-2 rounded-md border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {o.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.occurred_at).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono tabular-nums text-sm text-foreground">
                          {inr(oTotal)}
                        </span>
                        {isDraft && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => deleteBillOrderAction(o.id),
                                "Order removed",
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove order</span>
                          </Button>
                        )}
                      </div>
                    </div>
                    {(o.items ?? []).map((i) => (
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
                    {isDraft && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Input
                          className="col-span-2"
                          placeholder="Item (e.g. Maggi)"
                          value={oi.description}
                          onChange={(e) =>
                            setOrderItem({
                              ...orderItem,
                              [o.id]: { ...oi, description: e.target.value },
                            })
                          }
                        />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Amount"
                          value={oi.amount}
                          onChange={(e) =>
                            setOrderItem({
                              ...orderItem,
                              [o.id]: { ...oi, amount: e.target.value },
                            })
                          }
                        />
                        <Input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={oi.quantity}
                          onChange={(e) =>
                            setOrderItem({
                              ...orderItem,
                              [o.id]: { ...oi, quantity: e.target.value },
                            })
                          }
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="col-span-2 sm:col-span-4"
                          disabled={pending || !oi.description || !oi.amount}
                          onClick={() =>
                            run(async () => {
                              const r = await addBillItemAction(bill.id, {
                                category: "adhoc",
                                order_id: o.id,
                                description: oi.description,
                                amount: Number(oi.amount),
                                quantity: Number(oi.quantity) || 1,
                              })
                              if (r.ok)
                                setOrderItem({
                                  ...orderItem,
                                  [o.id]: {
                                    description: "",
                                    amount: "",
                                    quantity: "1",
                                  },
                                })
                              return r
                            }, "Item added")
                          }
                        >
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add to order
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
              {isDraft && (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-dashed border-border p-3">
                  <Input
                    placeholder="Order label (e.g. Evening snack)"
                    value={order_.label}
                    onChange={(e) =>
                      setOrder({ ...order_, label: e.target.value })
                    }
                  />
                  <Input
                    type="datetime-local"
                    value={order_.occurred_at}
                    onChange={(e) =>
                      setOrder({ ...order_, occurred_at: e.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    className="col-span-2"
                    disabled={pending || !order_.label}
                    onClick={() =>
                      run(async () => {
                        const r = await createBillOrderAction({
                          bill_id: bill.id,
                          label: order_.label,
                          occurred_at: order_.occurred_at
                            ? new Date(order_.occurred_at).toISOString()
                            : undefined,
                        })
                        if (r.ok) setOrder({ label: "", occurred_at: "" })
                        return r
                      }, "Order created")
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    New order
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            {/* Extra charges (key/value) */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">
                Extra charges
              </h4>
              <p className="text-xs text-muted-foreground">
                Flexible line items — laundry, damages, discounts (use a
                negative amount for a discount).
              </p>
              {extra.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No extra charges.
                </p>
              ) : (
                extra.map((i) => (
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
                ))
              )}
              {isDraft && (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-dashed border-border p-3 sm:grid-cols-4">
                  <Input
                    className="col-span-2"
                    placeholder="Label (e.g. Laundry)"
                    value={extra_.description}
                    onChange={(e) =>
                      setExtra({ ...extra_, description: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={extra_.amount}
                    onChange={(e) =>
                      setExtra({ ...extra_, amount: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={extra_.quantity}
                    onChange={(e) =>
                      setExtra({ ...extra_, quantity: e.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    className="col-span-2 sm:col-span-4"
                    disabled={pending || !extra_.description || !extra_.amount}
                    onClick={() =>
                      run(async () => {
                        const r = await addBillItemAction(bill.id, {
                          category: "misc",
                          description: extra_.description,
                          amount: Number(extra_.amount),
                          quantity: Number(extra_.quantity) || 1,
                        })
                        if (r.ok)
                          setExtra({
                            description: "",
                            amount: "",
                            quantity: "1",
                          })
                        return r
                      }, "Charge added")
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add charge
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Total due
              </span>
              <span className="font-heading text-xl font-semibold tabular-nums text-foreground">
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
            className="h-7 w-7 text-muted-foreground"
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
