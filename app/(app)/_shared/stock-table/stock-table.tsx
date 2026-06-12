'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import { deactivateLotAction, deactivateLotsAction } from '@/lib/stock/actions';
import {
  servingsOnHand,
  lotValue,
  derivedUnitsPerPack,
  servingLabel,
  containerLabel,
  pluralize,
} from '@/lib/stock/compute';
import type {
  InventoryLotRow,
  MasterItemPick,
} from '@/lib/stock/types';
import type { InventoryCategory } from '@/lib/masters/categories';
import { AddStockDialog } from './add-stock-dialog';
import { EditStockDialog } from './edit-stock-dialog';
import { AddMasterItemDialog } from './add-master-item-dialog';

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const s = n.toFixed(3);
  return s.replace(/\.?0+$/, '');
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export function StockTable({
  category,
  categoryLabel,
  rows,
  masterItems,
  canWrite,
  canManageMasters,
}: {
  category: InventoryCategory;
  categoryLabel: string;
  rows: InventoryLotRow[];
  masterItems: MasterItemPick[];
  canWrite: boolean;
  canManageMasters: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InventoryLotRow | null>(null);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const [showNewMasterItem, setShowNewMasterItem] = useState(false);
  const [extraItems, setExtraItems] = useState<MasterItemPick[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');

  const refresh = useCallback(() => router.refresh(), [router]);
  const closeAdd = useCallback(() => {
    setCreating(false);
    setSelectedItemId('');
  }, []);
  const closeEdit = useCallback(() => setEditing(null), []);

  const selectedIds = useMemo(() => {
    return Object.keys(rowSelection).filter((id) => rowSelection[id]);
  }, [rowSelection]);

  const columns = useMemo<ColumnDef<InventoryLotRow>[]>(() => {
    const cols: ColumnDef<InventoryLotRow>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="rounded border-border text-primary focus:ring-ring cursor-pointer size-4"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="rounded border-border text-primary focus:ring-ring cursor-pointer size-4"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(!!e.target.checked)}
            aria-label="Select row"
          />
        ),
      },
      {
        accessorKey: 'item_name',
        header: 'Item',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.item_name}</span>
            {!row.original.is_active && (
              <Badge variant="destructive">Inactive</Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'pack_label',
        header: 'Size',
        cell: ({ getValue }) => (
          <span className="text-sm">{getValue<string>() ?? '—'}</span>
        ),
      },
      {
        id: 'qty',
        header: 'On hand',
        cell: ({ row }) => {
          const qty = Number(row.original.qty_packs ?? 0);
          const upp = derivedUnitsPerPack(row.original.category ?? '', {
            kind: row.original.kind,
            volume_ml: row.original.volume_ml,
            unit_count: row.original.unit_count,
          });
          const servings = servingsOnHand(qty, upp);
          const label = servingLabel(row.original.category ?? '');
          const c = containerLabel(row.original.category ?? '', {
            kind: row.original.kind,
            label: row.original.pack_label,
          });
          return (
            <div className="flex flex-col">
              <span className="font-mono text-sm tabular-nums">
                {formatNum(qty)} {pluralize(qty, c)}
              </span>
              {upp != null && upp > 1 ? (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatNum(servings)} {pluralize(servings, label)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'rate',
        header: 'Rate',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm tabular-nums">
            {formatMoney(Number(getValue<number>() ?? 0))}
          </span>
        ),
      },
      {
        id: 'value',
        header: 'Value',
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {formatMoney(
              lotValue(
                Number(row.original.qty_packs ?? 0),
                Number(row.original.rate ?? 0),
              ),
            )}
          </span>
        ),
      },
      {
        id: 'acquired',
        header: 'Acquired / Source',
        cell: ({ row }) => {
          const on = row.original.acquired_on;
          const src = row.original.source;
          if (!on && !src) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <div className="flex flex-col">
              {on ? (
                <span className="font-mono text-xs tabular-nums">
                  {formatDate(on)}
                </span>
              ) : null}
              {src ? (
                <span className="text-xs text-muted-foreground">{src}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="destructive">Inactive</Badge>
          ),
      },
    ];

    if (canWrite) {
      cols.push({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditing(row.original)}>
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditing(row.original)}>
                  Adjust quantity
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    const fd = new FormData();
                    fd.append('id', row.original.id ?? '');
                    const res = await deactivateLotAction(null, fd);
                    if (res?.ok) {
                      toast.success('Lot deactivated');
                      refresh();
                    } else {
                      toast.error(res?.error ?? 'Could not deactivate');
                    }
                  }}
                  className="text-destructive"
                >
                  Deactivate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      });
    }

    return cols;
  }, [canWrite, refresh]);

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      columnFilters: filter ? [{ id: 'item_name', value: filter }] : [],
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => row.id ?? '',
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by item..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        {selectedIds.length > 0 && (
          <Button
            variant="destructive"
            onClick={async () => {
              const res = await deactivateLotsAction(selectedIds);
              if (res?.ok) {
                toast.success(`${selectedIds.length} stock lot(s) deactivated`);
                setRowSelection({});
                refresh();
              } else {
                toast.error(res?.error ?? 'Could not deactivate selected lots');
              }
            }}
            className="transition-ds press"
          >
            Deactivate Selected ({selectedIds.length})
          </Button>
        )}
        <div className="flex-1" />
        {canWrite && category !== 'grocery' ? (
          <Button
            onClick={() => setCreating(true)}
            className="transition-ds press"
          >
            <Plus className="size-4 mr-1" /> Add to stock
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-md border border-border shadow-xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow
                key={hg.id}
                className="border-b border-border bg-muted/50 hover:bg-muted/50"
              >
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState
                    title={`No ${categoryLabel.toLowerCase()} stock yet`}
                    description={
                      category === 'grocery'
                        ? 'No grocery stock is currently tracked for this unit.'
                        : `Add a ${categoryLabel.toLowerCase()} purchase lot to start tracking stock for this unit.`
                    }
                    className="rounded-none border-0"
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-border transition-ds last:border-0 hover:bg-muted/40"
                >
                  {row.getVisibleCells().map((c) => (
                    <TableCell key={c.id} className="px-3 py-2 text-sm">
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {creating && category !== 'grocery' ? (
        <AddStockDialog
          open
          category={category}
          masterItems={masterItems}
          extraItems={extraItems}
          itemId={selectedItemId}
          setItemId={setSelectedItemId}
          canManageMasters={canManageMasters}
          onClose={closeAdd}
          onChanged={refresh}
          onCreateMasterItem={() => setShowNewMasterItem(true)}
        />
      ) : null}
      {editing ? (
        <EditStockDialog
          open
          lot={editing}
          onClose={closeEdit}
          onChanged={refresh}
        />
      ) : null}
      {canManageMasters && showNewMasterItem ? (
        <AddMasterItemDialog
          open
          category={category}
          onClose={() => setShowNewMasterItem(false)}
          onCreated={(item) => {
            setShowNewMasterItem(false);
            const fullItem: MasterItemPick = {
              ...item,
              pack_label: '',
              pack_kind: null,
              volume_ml: null,
              unit_count: null,
            };
            setExtraItems((prev) => [fullItem, ...prev]);
            setSelectedItemId(item.id);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

