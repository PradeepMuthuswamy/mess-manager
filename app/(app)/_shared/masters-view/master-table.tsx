'use client';

import { useCallback, useMemo, useState, useEffect, useTransition } from 'react';
import { format } from 'date-fns';
import {
  flexRender,
  getCoreRowModel,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Plus, Upload } from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  MasterFormDialog,
  type MasterFormMode,
} from './master-form-dialog';
import { MasterBulkImportDialog } from './master-bulk-import-dialog';
import { MasterMultiEditDialog } from './master-multi-edit-dialog';
import {
  deactivateMasterItemAction,
  unadoptVariantAction,
} from '@/lib/masters/actions';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import type { AuthorisationChip, MasterRow } from '@/lib/masters/types';
import type { Category, CategorySlug } from '@/lib/masters/categories';
import {
  rationClassEnum,
  rationTerrainEnum,
  RATION_CLASS_LABEL,
  RATION_TERRAIN_LABEL,
  type RationClass,
  type RationTerrain,
} from '@/lib/schemas/ration';

type CatalogRow = MasterRow & {
  is_adopted?: boolean;
  local_sku?: string | null;
  menu_rate?: number | null;
  is_enabled?: boolean;
};

type AdoptFilter = 'all' | 'adopted' | 'available';

const RANK_SHORT: Record<string, string> = {
  officer: 'Off',
  jco: 'JCO',
  or: 'OR',
  civilian: 'Civ',
};

const TERRAIN_SHORT: Record<string, string> = {
  plains: 'Plains',
  desert: 'Desert',
  high_altitude: 'High Alt',
  field: 'Field',
  sea: 'Sea',
};

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const s = n.toFixed(3);
  return s.replace(/\.?0+$/, '');
}

function formatInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isAdopted(row: CatalogRow): boolean {
  return Boolean(row.is_adopted);
}

function AuthorisationChips({ chips }: { chips: AuthorisationChip[] }) {
  if (chips.length === 0) {
    return <span className="text-xs text-muted-foreground">No authorisations</span>;
  }
  const visible = chips.slice(0, 4);
  const overflow = chips.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((c) => (
        <Badge
          key={c.scale_id}
          variant="secondary"
          className="font-mono text-[10px] tabular-nums cursor-default"
          title={`${RATION_CLASS_LABEL[c.rank_class]} — ${RATION_TERRAIN_LABEL[c.terrain]} · ${formatQty(c.auth_qty)} ${c.uom}`}
        >
          <span className="font-sans font-medium">
            {RANK_SHORT[c.rank_class] ?? c.rank_class}·{TERRAIN_SHORT[c.terrain] ?? c.terrain}
          </span>
          <span className="ml-1 text-muted-foreground">
            {formatQty(c.auth_qty)} {c.uom}
          </span>
        </Badge>
      ))}
      {overflow > 0 ? (
        <Badge
          variant="outline"
          className="text-[10px] cursor-default"
          title={chips.slice(4).map((c) => `${RATION_CLASS_LABEL[c.rank_class]} — ${RATION_TERRAIN_LABEL[c.terrain]} · ${formatQty(c.auth_qty)} ${c.uom}`).join('\n')}
        >
          +{overflow}
        </Badge>
      ) : null}
    </div>
  );
}

export function MasterTable({
  category,
  slug,
  rows,
  authorisations,
  rationScope = null,
  allowGlobal,
  defaultUnitId,
  isAllUnits,
  canWrite = true,
  categories = [],
  page = 1,
  pageSize = 15,
  totalCount = 0,
  sortBy = 'name',
  sortOrder = 'asc',
}: {
  category: Category;
  slug: CategorySlug;
  rows: MasterRow[];
  authorisations?: Record<string, AuthorisationChip[]>;
  rationScope?: {
    rankClass: RationClass | null;
    terrain: RationTerrain | null;
  } | null;
  allowGlobal: boolean;
  defaultUnitId: string | null;
  isAllUnits: boolean;
  canWrite?: boolean;
  categories?: Array<{ id: string; name: string; parent_id: string | null }>;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isUnitCatalog = Boolean(defaultUnitId) && !isAllUnits;
  const canCreateGlobal = allowGlobal;
  const canMutate = canWrite || allowGlobal;

  const initialQ = searchParams.get('q') || '';
  const [filter, setFilter] = useState(initialQ);
  const [adoptFilter, setAdoptFilter] = useState<AdoptFilter>('all');

  const [rankFilter, setRankFilter] = useState<RationClass | 'all'>('all');
  const [terrainFilter, setTerrainFilter] = useState<RationTerrain | 'all'>('all');
  const [formItem, setFormItem] = useState<MasterRow | null>(null);
  const [formMode, setFormMode] = useState<MasterFormMode | null>(null);
  const [importing, setImporting] = useState(false);
  const [multiEditing, setMultiEditing] = useState(false);
  const [unadoptPending, startUnadopt] = useTransition();

  const catalogRows = rows as CatalogRow[];

  const visibleRows = useMemo(() => {
    if (!isUnitCatalog || adoptFilter === 'all') return catalogRows;
    if (adoptFilter === 'adopted') return catalogRows.filter(isAdopted);
    return catalogRows.filter((r) => !isAdopted(r));
  }, [catalogRows, adoptFilter, isUnitCatalog]);

  // Debounced search logic. The no-op guard is load-bearing: every
  // router.push yields a NEW searchParams reference, which re-runs this
  // effect — without the guard it pushes the same URL in an infinite
  // RSC-refetch loop.
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const currentQ = searchParams.get('q') || '';
      if (filter === currentQ) return;
      const params = new URLSearchParams(searchParams.toString());
      if (filter) {
        params.set('q', filter);
      } else {
        params.delete('q');
      }
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [filter, pathname, router, searchParams]);

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      params.set('sortOrder', newOrder);
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return <span className="ml-1 text-xs text-muted-foreground/30">↕</span>;
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`${pathname}?${params.toString()}`);
  };

  const openForm = useCallback((mode: MasterFormMode, item: MasterRow | null = null) => {
    setFormMode(mode);
    setFormItem(item);
  }, []);

  const closeForm = useCallback(() => {
    setFormMode(null);
    setFormItem(null);
  }, []);

  const handleUnadopt = useCallback(
    (row: CatalogRow) => {
      if (!defaultUnitId) return;
      startUnadopt(async () => {
        const res = await unadoptVariantAction({
          unit_id: defaultUnitId,
          variant_id: row.id,
        });
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        toast.success(`Removed ${row.name} from this unit`);
        router.refresh();
      });
    },
    [defaultUnitId, router],
  );

  const columns = useMemo<ColumnDef<CatalogRow>[]>(() => {
    const cols: ColumnDef<CatalogRow>[] = [
      {
        accessorKey: 'name',
        header: () => (
          <button
            onClick={() => handleSort('name')}
            className="flex cursor-pointer items-center gap-1 font-semibold hover:text-foreground"
          >
            Product {renderSortIcon('name')}
          </button>
        ),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{row.original.name}</span>
            {isUnitCatalog && isAdopted(row.original) ? (
              <Badge variant="success">Adopted</Badge>
            ) : null}
            {isUnitCatalog && isAdopted(row.original) && row.original.is_enabled === false ? (
              <Badge variant="outline">Disabled</Badge>
            ) : null}
            {!isUnitCatalog ? (
              <Badge variant="secondary">Global</Badge>
            ) : null}
            {!row.original.is_active && (
              <Badge variant="destructive">Inactive</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'size_packaging',
        header: () => (
          <button
            onClick={() => handleSort('unit_value')}
            className="flex cursor-pointer items-center gap-1 font-semibold hover:text-foreground"
          >
            Size/Packaging {renderSortIcon('unit_value')}
          </button>
        ),
        cell: ({ row }) => {
          const val = row.original.unit_value;
          const type = row.original.unit_type;
          const pkg = row.original.package_type;
          return (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {val !== undefined ? `${val} ${type} ${pkg}` : row.original.pack_label ?? '—'}
            </span>
          );
        },
      },
      {
        accessorKey: 'sku',
        header: () => (
          <button
            onClick={() => handleSort('sku')}
            className="flex cursor-pointer items-center gap-1 font-semibold hover:text-foreground"
          >
            SKU {renderSortIcon('sku')}
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {getValue<string>() ?? '—'}
          </span>
        ),
      },
    ];

    if (isUnitCatalog) {
      cols.push(
        {
          id: 'local_sku',
          header: 'Local SKU',
          cell: ({ row }) => (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {isAdopted(row.original) ? (row.original.local_sku ?? '—') : '—'}
            </span>
          ),
        },
        {
          id: 'menu_rate',
          header: 'Menu rate',
          cell: ({ row }) => (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {isAdopted(row.original)
                ? formatInr(row.original.menu_rate ?? row.original.current_rate)
                : '—'}
            </span>
          ),
        },
      );
    }

    cols.push({
      id: 'category',
      header: 'Category',
      cell: ({ row }) => {
        const catName = row.original.category_name ?? row.original.category;
        const subcat = row.original.subcategory_name;
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground">
              {catName === 'soft_drink' ? 'Cold Drinks' : catName === 'cigar' ? 'Cigars' : catName}
            </span>
            {subcat && (
              <>
                <span className="text-xs text-muted-foreground/50">/</span>
                <span className="text-xs text-muted-foreground">{subcat}</span>
              </>
            )}
          </div>
        );
      },
    });

    if (category === 'ration') {
      cols.push({
        id: 'authorisations',
        header: 'Authorisations',
        cell: ({ row }) => {
          const all = authorisations?.[row.original.id] ?? [];
          const chips = all.filter(
            (c) =>
              (rankFilter === 'all' || c.rank_class === rankFilter) &&
              (terrainFilter === 'all' || c.terrain === terrainFilter),
          );
          return <AuthorisationChips chips={chips} />;
        },
      });
    }

    cols.push({
      accessorKey: 'updated_at',
      header: () => (
        <button
          onClick={() => handleSort('updated_at')}
          className="flex cursor-pointer items-center gap-1 font-semibold hover:text-foreground"
        >
          Updated {renderSortIcon('updated_at')}
        </button>
      ),
      cell: ({ getValue }) => {
        const v = getValue<string>();
        return (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {v ? format(new Date(v), 'dd/MM/yyyy') : '—'}
          </span>
        );
      },
    });

    cols.push({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const adopted = isAdopted(row.original);
        const enabled = row.original.is_enabled !== false;
        const showUnitActions = canWrite && isUnitCatalog;
        const showGlobalActions = canCreateGlobal;
        if (!showUnitActions && !showGlobalActions) return null;
        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={unadoptPending}>
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showUnitActions && (!adopted || !enabled) ? (
                  <DropdownMenuItem onClick={() => openForm('adopt', row.original)}>
                    {adopted ? 'Re-enable' : 'Adopt'}
                  </DropdownMenuItem>
                ) : null}
                {showUnitActions && adopted ? (
                  <DropdownMenuItem onClick={() => openForm('menu-rate', row.original)}>
                    Set menu rate
                  </DropdownMenuItem>
                ) : null}
                {showUnitActions && adopted ? (
                  <DropdownMenuItem
                    onClick={() => handleUnadopt(row.original)}
                    className="text-destructive"
                  >
                    Unadopt
                  </DropdownMenuItem>
                ) : null}
                {showUnitActions && showGlobalActions ? <DropdownMenuSeparator /> : null}
                {showGlobalActions ? (
                  <DropdownMenuItem onClick={() => openForm('edit', row.original)}>
                    Edit product
                  </DropdownMenuItem>
                ) : null}
                {showGlobalActions ? (
                  <DropdownMenuItem
                    onClick={async () => {
                      const fd = new FormData();
                      fd.append('id', row.original.id);
                      const res = await deactivateMasterItemAction(null, fd);
                      if (res?.ok) {
                        toast.success('Item deactivated');
                        router.refresh();
                      } else {
                        toast.error(res?.error ?? 'Could not deactivate');
                      }
                    }}
                    className="text-destructive"
                  >
                    Deactivate
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });

    return cols;
  }, [
    category,
    router,
    authorisations,
    rankFilter,
    terrainFilter,
    canWrite,
    canCreateGlobal,
    isUnitCatalog,
    sortBy,
    sortOrder,
    unadoptPending,
    defaultUnitId,
    openForm,
    handleUnadopt,
  ]);

  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const closeImport = useCallback(() => setImporting(false), []);
  const closeMultiEdit = useCallback(() => setMultiEditing(false), []);
  const handleImported = useCallback(() => router.refresh(), [router]);

  const emptyTitle = isUnitCatalog
    ? filter
      ? 'No catalog matches'
      : 'No variants on this page'
    : 'No items yet';
  const emptyDescription = isUnitCatalog
    ? 'Search the global catalog, then adopt a variant for this unit. Units do not create products.'
    : 'Add the first item or import via CSV.';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={
            isUnitCatalog ? 'Search catalog to adopt…' : 'Search by name...'
          }
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        {isUnitCatalog ? (
          <div className="flex items-center gap-1">
            {([
              ['all', 'All'],
              ['adopted', 'Adopted'],
              ['available', 'Available'],
            ] as const).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={adoptFilter === key ? 'default' : 'outline'}
                onClick={() => setAdoptFilter(key)}
                className="transition-ds"
              >
                {label}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="flex-1" />
        {canMutate ? (
          <>
            <Button
              variant="outline"
              onClick={() => setMultiEditing(true)}
              disabled={rows.length === 0}
              className="transition-ds"
            >
              <Pencil className="mr-1 size-4" /> Edit all
            </Button>
            <Button variant="outline" onClick={() => setImporting(true)} className="transition-ds">
              <Upload className="mr-1 size-4" /> Bulk import
            </Button>
            {canCreateGlobal ? (
              <Button
                onClick={() => openForm('create')}
                className="transition-ds press"
              >
                <Plus className="mr-1 size-4" /> Add
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {category === 'ration' ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-xs font-medium uppercase tracking-[0.04em] text-muted-foreground">
              Class
            </span>
            {rationScope?.rankClass ? (
              <Badge variant="secondary" className="font-medium">
                Showing your unit&apos;s scale:{' '}
                {RATION_CLASS_LABEL[rationScope.rankClass]}
              </Badge>
            ) : (
              <>
                <Button
                  size="sm"
                  variant={rankFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setRankFilter('all')}
                  className="transition-ds"
                >
                  All
                </Button>
                {rationClassEnum.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={rankFilter === c ? 'default' : 'outline'}
                    onClick={() => setRankFilter(c)}
                    className="transition-ds"
                  >
                    {RATION_CLASS_LABEL[c]}
                  </Button>
                ))}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-xs font-medium uppercase tracking-[0.04em] text-muted-foreground">
              Terrain
            </span>
            {rationScope?.terrain ? (
              <Badge variant="secondary" className="font-medium">
                Showing your unit&apos;s scale:{' '}
                {RATION_TERRAIN_LABEL[rationScope.terrain]}
              </Badge>
            ) : (
              <>
                <Button
                  size="sm"
                  variant={terrainFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setTerrainFilter('all')}
                  className="transition-ds"
                >
                  All
                </Button>
                {rationTerrainEnum.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={terrainFilter === t ? 'default' : 'outline'}
                    onClick={() => setTerrainFilter(t)}
                    className="transition-ds"
                  >
                    {RATION_TERRAIN_LABEL[t]}
                  </Button>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border shadow-xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-b border-border bg-muted/50 hover:bg-muted/50">
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
                    title={emptyTitle}
                    description={emptyDescription}
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

      {totalCount > pageSize ? (
        <div className="flex items-center justify-between py-1">
          <div className="text-xs font-medium text-muted-foreground">
            Showing {Math.min(totalCount, (page - 1) * pageSize + 1)} to{' '}
            {Math.min(totalCount, page * pageSize)} of {totalCount} items
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="cursor-pointer select-none transition-ds"
            >
              Previous
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              Page {page} of {Math.ceil(totalCount / pageSize)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= Math.ceil(totalCount / pageSize)}
              className="cursor-pointer select-none transition-ds"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {canMutate && formMode ? (
        <MasterFormDialog
          open
          mode={formMode}
          category={category}
          slug={slug}
          item={formItem}
          allowGlobal={allowGlobal}
          defaultUnitId={defaultUnitId}
          onClose={closeForm}
          categories={categories}
        />
      ) : null}
      {canMutate && importing ? (
        <MasterBulkImportDialog
          open
          category={category}
          slug={slug}
          unitId={defaultUnitId}
          isAllUnits={isAllUnits}
          allowGlobal={allowGlobal}
          onClose={closeImport}
          onImported={handleImported}
        />
      ) : null}
      {canMutate && multiEditing ? (
        <MasterMultiEditDialog
          open
          category={category}
          rows={catalogRows}
          allowGlobal={allowGlobal}
          defaultUnitId={defaultUnitId}
          onClose={closeMultiEdit}
        />
      ) : null}
    </div>
  );
}
