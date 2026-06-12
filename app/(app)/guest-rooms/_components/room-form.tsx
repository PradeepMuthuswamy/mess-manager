'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { FormError } from '@/components/shared/form-error';
import type {
  Room,
  UnitFurniture,
  RoomInventoryRow,
} from '@/lib/guest-rooms/types';
import type {
  CreateRoomInput,
  UpdateRoomInput,
} from '@/lib/schemas/guest-rooms';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import {
  createFurnitureItem,
  createRoom,
  fetchRoomInventory,
  roomInventoryKey,
  selectGuestRoomsRequest,
  updateRoom,
} from '@/lib/redux/guest-rooms';

interface RoomFormProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  room?: Room | null;
  furnitureCatalogue: UnitFurniture[];
}

type InventoryRow = RoomInventoryRow & { _key: string };

const FURNITURE_KINDS = ['furniture', 'fixture', 'equipment', 'other'] as const;
const CONDITIONS: RoomInventoryRow['condition'][] = ['good', 'fair', 'poor'];

function newRow(furnitureId = ''): InventoryRow {
  return {
    _key: crypto.randomUUID(),
    furniture_id: furnitureId,
    quantity: 1,
    condition: 'good',
    notes: null,
  };
}

export function RoomForm({
  open,
  onClose,
  unitId,
  room,
  furnitureCatalogue,
}: RoomFormProps) {
  const dispatch = useAppDispatch();
  const isEditing = !!room;
  const [name, setName] = useState(room?.name ?? '');
  const [status, setStatus] = useState<CreateRoomInput['status']>(
    (room?.status ?? 'available') as CreateRoomInput['status'],
  );
  const [roomType, setRoomType] = useState<string>(room?.room_type ?? 'Standard');
  const [nightlyRate, setNightlyRate] = useState<number>(
    room ? Number(room.nightly_rate) : 0,
  );
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [newFurnName, setNewFurnName] = useState('');
  const [newFurnKind, setNewFurnKind] =
    useState<(typeof FURNITURE_KINDS)[number]>('furniture');
  const [pending, setPending] = useState(false);
  const [creatingFurniture, setCreatingFurniture] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const inventoryRequest = useAppSelector((state) =>
    room?.id
      ? selectGuestRoomsRequest(state, roomInventoryKey(room.id))
      : { status: 'idle', error: null, fetchedAt: null },
  );
  const inventoryLoading = inventoryRequest.status === 'loading';

  const catalogue = useMemo(
    () => [...furnitureCatalogue].sort((a, b) => a.name.localeCompare(b.name)),
    [furnitureCatalogue],
  );

  useEffect(() => {
    if (!open || !room?.id) return undefined;

    let active = true;
    dispatch(fetchRoomInventory(room.id))
      .then((rows) => {
        if (!active) return;
        setInventory(
          rows.map((row) => ({
            _key: crypto.randomUUID(),
            furniture_id: row.furniture_id,
            quantity: row.quantity,
            condition: row.condition as RoomInventoryRow['condition'],
            notes: row.notes,
          })),
        );
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : 'Failed to load inventory',
        );
      });

    return () => {
      active = false;
    };
  }, [dispatch, open, room?.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError('Room name is required.');
      return;
    }

    const cleanInventory = inventory
      .filter((row) => row.furniture_id)
      .map(({ furniture_id, quantity, condition, notes }) => ({
        furniture_id,
        quantity: Number(quantity) || 1,
        condition,
        notes: notes?.trim() ? notes.trim() : null,
      }));

    const roomInput = {
      name: name.trim(),
      status,
      room_type: roomType as CreateRoomInput['room_type'],
      nightly_rate: Number(nightlyRate) || 0,
      inventory: cleanInventory,
    } satisfies Omit<CreateRoomInput, 'unit_id'>;

    setPending(true);
    try {
      if (isEditing && room) {
        await dispatch(
          updateRoom({
            id: room.id,
            input: roomInput satisfies UpdateRoomInput,
          }),
        );
        toast.success('Room updated');
      } else {
        await dispatch(
          createRoom({
            unit_id: unitId,
            ...roomInput,
          }),
        );
        toast.success('Room created');
      }
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save room';
      setSubmitError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function handleAddFurniture() {
    const trimmed = newFurnName.trim();
    if (!trimmed) return;

    setCreatingFurniture(true);
    try {
      const created = await dispatch(
        createFurnitureItem({
          unit_id: unitId,
          name: trimmed,
          kind: newFurnKind,
        }),
      );
      setInventory((rows) => [...rows, newRow(created.id)]);
      setNewFurnName('');
      setNewFurnKind('furniture');
      toast.success('Furniture item added');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to add furniture',
      );
    } finally {
      setCreatingFurniture(false);
    }
  }

  function updateRow(key: string, patch: Partial<RoomInventoryRow>) {
    setInventory((rows) =>
      rows.map((row) => (row._key === key ? { ...row, ...patch } : row)),
    );
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Room' : 'Add Room'}
      description={
        isEditing
          ? 'Update the room details and its inventory.'
          : 'Enter the details and inventory for the new guest room.'
      }
      footer={
        <Button
          type="submit"
          form="room-form"
          disabled={pending || inventoryLoading}
          className="press"
        >
          {pending
            ? isEditing
              ? 'Updating...'
              : 'Creating...'
            : isEditing
              ? 'Save Changes'
              : 'Create Room'}
        </Button>
      }
    >
      <form id="room-form" onSubmit={handleSubmit} className="space-y-5 py-4">
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
          <Select
            value={status}
            onValueChange={(value) =>
              setStatus(value as CreateRoomInput['status'])
            }
          >
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
              onClick={() => setInventory((rows) => [...rows, newRow()])}
              disabled={catalogue.length === 0 || inventoryLoading}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add item
            </Button>
          </div>

          {inventoryLoading ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Loading room inventory...
            </p>
          ) : inventory.length === 0 ? (
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
                        onValueChange={(value) =>
                          updateRow(row._key, { furniture_id: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select furniture" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogue.map((furniture) => (
                            <SelectItem key={furniture.id} value={furniture.id}>
                              {furniture.name}
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
                            quantity: Math.max(1, Number(e.target.value) || 1),
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
                        onValueChange={(value) =>
                          updateRow(row._key, {
                            condition: value as RoomInventoryRow['condition'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITIONS.map((condition) => (
                            <SelectItem
                              key={condition}
                              value={condition}
                              className="capitalize"
                            >
                              {condition}
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
                          rows.filter((item) => item._key !== row._key),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove item</span>
                    </Button>
                  </div>
                  <Input
                    placeholder="Notes (optional)"
                    value={row.notes ?? ''}
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
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddFurniture();
                  }
                }}
              />
              <Select
                value={newFurnKind}
                onValueChange={(value) =>
                  setNewFurnKind(value as (typeof FURNITURE_KINDS)[number])
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FURNITURE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind} className="capitalize">
                      {kind}
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
                {creatingFurniture ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        </div>

        <FormError message={submitError ?? inventoryRequest.error} />
      </form>
    </AdaptiveModal>
  );
}
