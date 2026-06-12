"use client"

import { useActionState, useEffect, useMemo, useState, useTransition } from "react"
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
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  createRoomAction,
  updateRoomAction,
  createFurnitureItemAction,
  fetchRoomInventoryAction,
} from "@/lib/guest-rooms/actions"
import type {
  Room,
  UnitFurniture,
  RoomInventoryRow,
} from "@/lib/guest-rooms/types"

import { useAppContext } from "@/lib/auth/context"
import { FormError } from "@/components/shared/form-error"

interface RoomFormProps {
  open: boolean
  onClose: () => void
  room?: Room | null
  furnitureCatalogue: UnitFurniture[]
}

type InventoryRow = RoomInventoryRow & { _key: string }

const FURNITURE_KINDS = ["furniture", "fixture", "equipment", "other"] as const
const CONDITIONS: RoomInventoryRow["condition"][] = ["good", "fair", "poor"]

function newRow(furnitureId = ""): InventoryRow {
  return {
    _key: crypto.randomUUID(),
    furniture_id: furnitureId,
    quantity: 1,
    condition: "good",
    notes: null,
  }
}

export function RoomForm({
  open,
  onClose,
  room,
  furnitureCatalogue,
}: RoomFormProps) {
  const { activeUnitId } = useAppContext()
  const isEditing = !!room
  const [name, setName] = useState(room?.name ?? "")
  const [status, setStatus] = useState<string>(room?.status ?? "available")
  const [roomType, setRoomType] = useState<string>(room?.room_type ?? "Standard")
  const [nightlyRate, setNightlyRate] = useState<number>(room ? Number(room.nightly_rate) : 0)

  // Items created inline this session, merged over the server-provided
  // catalogue so a freshly-created item is immediately selectable without
  // a prop->state sync effect.
  const [added, setAdded] = useState<UnitFurniture[]>([])
  const catalogue = useMemo(
    () =>
      [...furnitureCatalogue, ...added].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [furnitureCatalogue, added],
  )
  const [inventory, setInventory] = useState<InventoryRow[]>([])

  // "Add new furniture" inline editor.
  const [newFurnName, setNewFurnName] = useState("")
  const [newFurnKind, setNewFurnKind] =
    useState<(typeof FURNITURE_KINDS)[number]>("furniture")
  const [creatingFurniture, startCreateFurniture] = useTransition()

  useEffect(() => {
    if (!room) return
    let active = true
    // Load existing inventory for the room being edited.
    fetchRoomInventoryAction(room.id).then((res) => {
      if (!active) return
      if ("data" in res && res.data) {
        setInventory(
          res.data.map((r) => ({
            _key: crypto.randomUUID(),
            furniture_id: r.furniture_id,
            quantity: r.quantity,
            condition: r.condition as RoomInventoryRow["condition"],
            notes: r.notes,
          })),
        )
      } else {
        setInventory([])
      }
    })
    return () => {
      active = false
    }
  }, [room])

  const [state, formAction, pending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_: { ok?: boolean; error?: string } | null) => {
      const cleanInventory = inventory
        .filter((r) => r.furniture_id)
        .map(({ furniture_id, quantity, condition, notes }) => ({
          furniture_id,
          quantity: Number(quantity) || 1,
          condition,
          notes: notes?.trim() ? notes.trim() : null,
        }))

      if (isEditing && room) {
        return await updateRoomAction(room.id, {
          name,
          status: status as Room["status"],
          room_type: roomType,
          nightly_rate: Number(nightlyRate) || 0,
          inventory: cleanInventory,
        })
      }
      return await createRoomAction({
        unit_id: activeUnitId!,
        name,
        status: status as Room["status"],
        room_type: roomType,
        nightly_rate: Number(nightlyRate) || 0,
        inventory: cleanInventory,
      })
    },
    null,
  )

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEditing ? "Room updated" : "Room created")
      onClose()
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, onClose, isEditing])

  function handleAddFurniture() {
    const trimmed = newFurnName.trim()
    if (!trimmed) return
    startCreateFurniture(async () => {
      const res = await createFurnitureItemAction({
        unit_id: activeUnitId!,
        name: trimmed,
        kind: newFurnKind,
      })
      if ("error" in res && res.error) {
        toast.error(res.error)
        return
      }
      if ("data" in res && res.data) {
        const created = res.data as UnitFurniture
        setAdded((a) => [...a, created])
        setInventory((rows) => [...rows, newRow(created.id)])
        setNewFurnName("")
        setNewFurnKind("furniture")
        toast.success("Furniture item added")
      }
    })
  }

  function updateRow(key: string, patch: Partial<RoomInventoryRow>) {
    setInventory((rows) =>
      rows.map((r) => (r._key === key ? { ...r, ...patch } : r)),
    )
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Room" : "Add Room"}
      description={
        isEditing
          ? "Update the room details and its inventory."
          : "Enter the details and inventory for the new guest room."
      }
      footer={
        <Button
          type="submit"
          form="room-form"
          disabled={pending}
          className="press"
        >
          {pending
            ? isEditing
              ? "Updating..."
              : "Creating..."
            : isEditing
              ? "Save Changes"
              : "Create Room"}
        </Button>
      }
    >
      <form id="room-form" action={formAction} className="space-y-5 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm font-medium">
            Room Name / Number
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Room 101, Suite A"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="room-type" className="text-sm font-medium">
            Room Type
          </Label>
          <Select value={roomType} onValueChange={setRoomType}>
            <SelectTrigger id="room-type">
              <SelectValue placeholder="Select room type" />
            </SelectTrigger>
            <SelectContent>
              {['Standard', 'Deluxe', 'Executive', 'Suite', 'VIP'].map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nightly-rate" className="text-sm font-medium">
            Nightly Rate (₹)
          </Label>
          <Input
            id="nightly-rate"
            type="number"
            min={0}
            step="0.01"
            value={nightlyRate}
            onChange={(e) => setNightlyRate(Number(e.target.value) || 0)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status" className="text-sm font-medium">
            Status
          </Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="out_of_service">Out of service</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">Inventory</h3>
              <p className="text-xs text-muted-foreground">
                Furniture, fixtures and equipment in this room.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInventory((r) => [...r, newRow()])}
              disabled={catalogue.length === 0}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add item
            </Button>
          </div>

          {inventory.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No inventory recorded for this room yet.
            </p>
          ) : (
            <div className="space-y-3">
              {inventory.map((row) => (
                <div
                  key={row._key}
                  className="space-y-2 rounded-md border border-border p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Item
                      </Label>
                      <Select
                        value={row.furniture_id || undefined}
                        onValueChange={(v) =>
                          updateRow(row._key, { furniture_id: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select furniture" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogue.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20 space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Qty
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) =>
                          updateRow(row._key, {
                            quantity: Math.max(
                              1,
                              Number(e.target.value) || 1,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="w-28 space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Condition
                      </Label>
                      <Select
                        value={row.condition}
                        onValueChange={(v) =>
                          updateRow(row._key, {
                            condition: v as RoomInventoryRow["condition"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITIONS.map((c) => (
                            <SelectItem
                              key={c}
                              value={c}
                              className="capitalize"
                            >
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-6 h-9 w-9 text-muted-foreground"
                      onClick={() =>
                        setInventory((rows) =>
                          rows.filter((r) => r._key !== row._key),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove item</span>
                    </Button>
                  </div>
                  <Input
                    placeholder="Notes (optional)"
                    value={row.notes ?? ""}
                    onChange={(e) =>
                      updateRow(row._key, {
                        notes: e.target.value || null,
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}

          <div className="rounded-md border border-dashed border-border p-3">
            <Label className="text-xs font-medium text-muted-foreground">
              Add a new furniture item to this unit&apos;s catalogue
            </Label>
            <div className="mt-2 flex items-end gap-2">
              <Input
                placeholder="e.g. Wooden wardrobe"
                value={newFurnName}
                onChange={(e) => setNewFurnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddFurniture()
                  }
                }}
              />
              <Select
                value={newFurnKind}
                onValueChange={(v) =>
                  setNewFurnKind(v as (typeof FURNITURE_KINDS)[number])
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FURNITURE_KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddFurniture}
                disabled={creatingFurniture || !newFurnName.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        <FormError message={state?.error} />
      </form>
    </AdaptiveModal>
  )
}
