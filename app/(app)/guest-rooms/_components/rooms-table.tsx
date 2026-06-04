"use client"

import { useState } from "react"
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
import { Edit2, Plus, BedDouble } from "lucide-react"
import type { Room, RoomCurrentStatus, UnitFurniture } from "@/lib/guest-rooms/types"

import { RoomForm } from "./room-form"
import { EmptyState } from "@/components/shared/empty-state"

// Derived occupancy status: Badge variant + label. Tokens only.
const STATUS_META: Record<
  RoomCurrentStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  vacant:         { label: "Vacant",         variant: "secondary"   },
  reserved:       { label: "Reserved",       variant: "outline"     },
  occupied:       { label: "Occupied",       variant: "default"     },
  maintenance:    { label: "Maintenance",    variant: "destructive" },
  out_of_service: { label: "Out of service", variant: "destructive" },
};

// Operational status: simple readable label.
const OPS_LABEL: Record<string, string> = {
  available:       "Available",
  maintenance:     "Maintenance",
  out_of_service:  "Out of service",
};

interface RoomsTableProps {
  rooms: Room[]
  unitId: string
  furnitureCatalogue: UnitFurniture[]
}

export function RoomsTable({ rooms, unitId, furnitureCatalogue }: RoomsTableProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)

  const handleEdit = (room: Room) => {
    setSelectedRoom(room)
    setIsFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedRoom(null)
    setIsFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
        </p>
        <Button onClick={handleAdd} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Room
        </Button>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={<BedDouble className="h-5 w-5" />}
          title="No rooms configured"
          description="Add your first guest room to start managing bookings."
          action={
            <Button size="sm" onClick={handleAdd}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Room
            </Button>
          }
        />
      ) : (
        <div className="rounded-md border border-border shadow-xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3">
                  Room
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3">
                  Type
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 text-right">
                  Rate / Night
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3">
                  Occupancy
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3">
                  Operational
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => {
                const current = (room.current_status ?? "vacant") as RoomCurrentStatus;
                const meta = STATUS_META[current];
                const opsLabel = OPS_LABEL[room.status] ?? room.status.replace(/_/g, " ");
                return (
                  <TableRow key={room.id} className="border-t border-border">
                    <TableCell className="py-2 px-3 font-medium text-foreground text-sm">
                      {room.name}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-sm text-muted-foreground">
                      {room.room_type}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right font-mono tabular-nums text-sm text-foreground">
                      ₹{Number(room.nightly_rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <Badge variant={meta.variant} className="text-xs">
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-sm text-muted-foreground capitalize">
                      {opsLabel}
                    </TableCell>
                    <TableCell className="py-2 px-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(room)}
                        className="h-7 w-7"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Edit {room.name}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <RoomForm
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        unitId={unitId}
        room={selectedRoom}
        furnitureCatalogue={furnitureCatalogue}
      />
    </div>
  )
}
