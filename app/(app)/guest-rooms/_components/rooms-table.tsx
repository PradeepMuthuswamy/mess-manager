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
import { Edit2, Plus, BedDouble, Search, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react"
import type { Room, RoomCurrentStatus, UnitFurniture } from "@/lib/guest-rooms/types"
import { Input } from "@/components/ui/input"

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
  furnitureCatalogue: UnitFurniture[]
  onRefresh?: () => void
}

export function RoomsTable({ rooms, furnitureCatalogue, onRefresh }: RoomsTableProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<keyof Room | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const handleEdit = (room: Room) => {
    setSelectedRoom(room)
    setIsFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedRoom(null)
    setIsFormOpen(true)
  }

  // 1. Filter rooms based on query
  const filteredRooms = rooms.filter((room) => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true
    return (
      room.name?.toLowerCase().includes(query) ||
      room.room_type?.toLowerCase().includes(query)
    )
  })

  // 2. Sort rooms
  const sortedRooms = [...filteredRooms].sort((a, b) => {
    if (!sortField) return 0
    let aVal = a[sortField]
    let bVal = b[sortField]

    if (aVal === null || aVal === undefined) aVal = ""
    if (bVal === null || bVal === undefined) bVal = ""

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal
    }

    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()

    if (aStr < bStr) return sortDirection === "asc" ? -1 : 1
    if (aStr > bStr) return sortDirection === "asc" ? 1 : -1
    return 0
  })

  // 3. Paginate rooms
  const totalPages = Math.ceil(sortedRooms.length / pageSize)
  const activePage = Math.min(currentPage, Math.max(1, totalPages))
  const startIndex = (activePage - 1) * pageSize
  const paginatedRooms = sortedRooms.slice(startIndex, startIndex + pageSize)

  const handleSort = (field: keyof Room) => {
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

  const renderSortIcon = (field: keyof Room) => {
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
            placeholder="Search rooms by name or type..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-8 bg-background"
          />
        </div>
        <div className="flex items-center gap-3 justify-between sm:justify-end shrink-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {searchQuery.trim()
              ? `${filteredRooms.length} of ${rooms.length} rooms matched`
              : `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}
          </p>
          <Button onClick={handleAdd} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Add Room
          </Button>
        </div>
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
      ) : filteredRooms.length === 0 ? (
        <div className="rounded-md border border-border border-dashed p-8 text-center text-muted-foreground bg-muted/5">
          No rooms match your search query.
        </div>
      ) : (
        <div className="rounded-md border border-border shadow-xs overflow-hidden bg-background">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead 
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Room
                    {renderSortIcon('name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => handleSort('room_type')}
                >
                  <div className="flex items-center">
                    Type
                    {renderSortIcon('room_type')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors text-right"
                  onClick={() => handleSort('nightly_rate')}
                >
                  <div className="flex items-center justify-end">
                    Rate / Night
                    {renderSortIcon('nightly_rate')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => handleSort('current_status')}
                >
                  <div className="flex items-center">
                    Occupancy
                    {renderSortIcon('current_status')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Operational
                    {renderSortIcon('status')}
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2 px-3 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRooms.map((room) => {
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground font-medium">
            Showing {startIndex + 1} to {Math.min(startIndex + pageSize, filteredRooms.length)} of {filteredRooms.length} rooms
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

      <RoomForm
        key={isFormOpen ? (selectedRoom ? `edit-${selectedRoom.id}` : "new") : "closed"}
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false)
          onRefresh?.()
        }}
        room={selectedRoom}
        furnitureCatalogue={furnitureCatalogue}
      />
    </div>
  )
}
