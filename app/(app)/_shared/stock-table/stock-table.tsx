'use client';

import { useCallback, useEffect, useState } from 'react';
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
import {
  MoreHorizontal,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/shared/empty-state';
import { toast } from 'sonner';
import { deactivateLotAction } from '@/lib/stock/actions';
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
import {
  categoryFromSlug,
  type CategorySlug,
  type InventoryCategory,
} from '@/lib/masters/categories';
import { AddStockDialog } from './add-stock-dialog';
import { EditStockDialog } from './edit-stock-dialog';
import { AddMasterItemDialog } from './add-master-item-dialog';

// Redux Integration
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import {
  selectStockUi,
  openAddDialog,
  closeAddDialog,
  openEditDialog,
  closeEditDialog,
  openAddMasterDialog,
  closeAddMasterDialog,
} from '@/lib/redux/stock/slice';

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

/**
 * Format the pack size/label to remove trailing zeroes and make it prettier.
 * E.g., "150.000 GRAM PACKET" -> "150 g packet"
 * E.g., "750.000 ML BOTTLE" -> "750 ml bottle"
 * E.g., "1.000 PIECE BOTTLE" -> "1 pc bottle"
 */
function formatPackSize(label: string | null | undefined): string {
  if (!label) return '—';
  
  // 1. Remove trailing decimals (e.g. 150.000 -> 150)
  let clean = label.replace(/\b(\d+)\.0+\b/g, '$1');
  
  // 2. Format common units to lowercase standard abbreviations
  clean = clean.replace(/\bML\b/g, 'ml');
  clean = clean.replace(/\bLITRE\b/g, 'l');
  clean = clean.replace(/\bGRAM\b/g, 'g');
  clean = clean.replace(/\bKG\b/g, 'kg');
  clean = clean.replace(/\bPIECE\b/g, 'pc');
  
  // 3. Lowercase common packaging types
  clean = clean.replace(/\bBOTTLE\b/g, 'bottle');
  clean = clean.replace(/\bPACKET\b/g, 'packet');
  clean = clean.replace(/\bTIN\b/g, 'tin');
  clean = clean.replace(/\bCAN\b/g, 'can');
  
  return clean;
}

export function StockTable({
  category,
  categoryLabel,
  rows,
  masterItems,
  canWrite,
  canManageMasters,
  currentPage = 1,
  pageSize = 15,
  totalCount = 0,
  q = '',
  sortBy = 'item_name',
  sortOrder = 'asc',
}: {
  category: CategorySlug;
  categoryLabel: string;
  rows: InventoryLotRow[];
  masterItems: MasterItemPick[];
  canWrite: boolean;
  canManageMasters: boolean;
  currentPage?: number;
  pageSize?: number;
  totalCount?: number;
  q?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  // Read dialog visibility from Redux
  const {
    isAddOpen,
    isEditOpen,
    isAddMasterOpen,
    selectedItemId,
    selectedLot,
  } = useAppSelector(selectStockUi);

  const [extraItems, setExtraItems] = useState<MasterItemPick[]>([]);
  const [localSearch, setLocalSearch] = useState(q);
  const [prevQ, setPrevQ] = useState(q);

  if (q !== prevQ) {
    setLocalSearch(q);
    setPrevQ(q);
  }

  const refresh = useCallback(() => router.refresh(), [router]);
  const basePath = category === 'grocery' ? '/grocery/stock' : '/stock';

  // Debounced search logic (backend integrated)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch === q) return;
      
      const searchParams = new URLSearchParams(window.location.search);
      if (localSearch) {
        searchParams.set('q', localSearch);
      } else {
        searchParams.delete('q');
      }
      searchParams.set('page', '1'); // reset to page 1
      router.push(`${basePath}?${searchParams.toString()}`);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [localSearch, q, router, basePath]);

  // Sort handler (backend integrated)
  const handleSort = (field: string) => {
    const nextOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('sortBy', field);
    searchParams.set('sortOrder', nextOrder);
    searchParams.set('page', '1'); // reset to page 1
    router.push(`${basePath}?${searchParams.toString()}`);
  };

  // Pagination handler (backend integrated)
  const handlePageChange = (newPage: number) => {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('page', newPage.toString());
    router.push(`${basePath}?${searchParams.toString()}`);
  };

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="size-3.5 ml-1 inline text-muted-foreground/50" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="size-3.5 ml-1 inline text-foreground font-bold" />
    ) : (
      <ArrowDown className="size-3.5 ml-1 inline text-foreground font-bold" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and Action Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by item..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex-1" />
        {canWrite && category !== 'grocery' ? (
          <Button
            onClick={() => dispatch(openAddDialog())}
            className="transition-ds press cursor-pointer"
          >
            <Plus className="size-4 mr-1" /> Add to stock
          </Button>
        ) : null}
      </div>

      {/* Flat Stock Lots Table */}
      <div className="overflow-hidden rounded-md border border-border shadow-xs bg-background">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/50 hover:bg-muted/50">
              <TableHead
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none transition-ds hover:text-foreground"
                onClick={() => handleSort('item_name')}
              >
                Item {renderSortIcon('item_name')}
              </TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Size
              </TableHead>
              <TableHead
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none transition-ds hover:text-foreground"
                onClick={() => handleSort('qty')}
              >
                On Hand {renderSortIcon('qty')}
              </TableHead>
              <TableHead
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none transition-ds hover:text-foreground"
                onClick={() => handleSort('rate')}
              >
                Rate {renderSortIcon('rate')}
              </TableHead>
              <TableHead
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none transition-ds hover:text-foreground"
                onClick={() => handleSort('value')}
              >
                Value {renderSortIcon('value')}
              </TableHead>
              <TableHead
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none transition-ds hover:text-foreground"
                onClick={() => handleSort('acquired')}
              >
                Acquired / Source {renderSortIcon('acquired')}
              </TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right w-16">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    title={`No ${categoryLabel.toLowerCase()} stock found`}
                    description={
                      localSearch
                        ? `No items matching "${localSearch}" are currently in stock.`
                        : `No ${categoryLabel.toLowerCase()} items are currently in stock.`
                    }
                    className="rounded-none border-0 py-12"
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const qty = Number(row.qty_packs ?? 0);
                const upp = derivedUnitsPerPack(row.category ?? '', {
                  kind: row.kind,
                  volume_ml: row.volume_ml,
                  unit_count: row.unit_count,
                });
                const servings = servingsOnHand(qty, upp);
                const label = servingLabel(row.category ?? '');
                const c = containerLabel(row.category ?? '', {
                  kind: row.kind,
                  label: row.pack_label,
                });

                return (
                  <TableRow
                    key={row.id}
                    className="border-b border-border transition-ds last:border-0 hover:bg-muted/40"
                  >
                    <TableCell className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {row.item_name}
                        </span>
                        {!row.is_active && (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-muted-foreground text-sm">
                      {formatPackSize(row.pack_label || row.uom)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                          {formatNum(qty)} {pluralize(qty, c)}
                        </span>
                        {upp != null && upp > 1 ? (
                          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                            {formatNum(servings)} {pluralize(servings, label)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-sm tabular-nums text-foreground">
                      {formatMoney(Number(row.rate ?? 0))}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatMoney(lotValue(qty, Number(row.rate ?? 0)))}
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <div className="flex flex-col">
                        {row.acquired_on ? (
                          <span className="font-mono text-xs tabular-nums text-foreground">
                            {formatDate(row.acquired_on)}
                          </span>
                        ) : null}
                        {row.source ? (
                          <span className="text-xs text-muted-foreground">{row.source}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right">
                      {canWrite ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8 p-0 cursor-pointer hover:bg-muted transition-ds">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => dispatch(openEditDialog(row))}>
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => dispatch(openEditDialog(row))}>
                              Adjust quantity
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                const fd = new FormData();
                                fd.append('id', row.id ?? '');
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
                      ) : (
                        <span className="text-2xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between py-2 px-1 border-t border-border/50">
        <span className="text-xs text-muted-foreground">
          Showing{' '}
          <span className="font-semibold text-foreground">
            {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}
          </span>{' '}
          to{' '}
          <span className="font-semibold text-foreground">
            {Math.min(currentPage * pageSize, totalCount)}
          </span>{' '}
          of{' '}
          <span className="font-semibold text-foreground">{totalCount}</span>{' '}
          results
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
            className="h-8 w-8 p-0 cursor-pointer"
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">Previous Page</span>
          </Button>
          <span className="text-xs px-2 font-medium">
            Page {currentPage} of {Math.ceil(totalCount / pageSize) || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage * pageSize >= totalCount || totalCount === 0}
            onClick={() => handlePageChange(currentPage + 1)}
            className="h-8 w-8 p-0 cursor-pointer"
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">Next Page</span>
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      {isAddOpen && category !== 'grocery' ? (
        <AddStockDialog
          open
          category={categoryFromSlug(category) as InventoryCategory}
          masterItems={masterItems}
          extraItems={extraItems}
          itemId={selectedItemId ?? ''}
          setItemId={(id) => dispatch(openAddDialog({ itemId: id }))}
          canManageMasters={canManageMasters}
          onClose={() => dispatch(closeAddDialog())}
          onChanged={refresh}
          onCreateMasterItem={() => dispatch(openAddMasterDialog())}
        />
      ) : null}

      {isEditOpen && selectedLot ? (
        <EditStockDialog
          open
          lot={selectedLot}
          onClose={() => dispatch(closeEditDialog())}
          onChanged={refresh}
        />
      ) : null}

      {canManageMasters && isAddMasterOpen ? (
        <AddMasterItemDialog
          open
          category={categoryFromSlug(category) as InventoryCategory}
          onClose={() => dispatch(closeAddMasterDialog())}
          onCreated={(item) => {
            dispatch(closeAddMasterDialog());
            const fullItem: MasterItemPick = {
              ...item,
              pack_label: '',
              pack_kind: null,
              volume_ml: null,
              unit_count: null,
            };
            setExtraItems((prev) => [fullItem, ...prev]);
            dispatch(openAddDialog({ itemId: item.id }));
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
