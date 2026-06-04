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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MoreHorizontal, Pencil, Plus, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MasterFormDialog } from './master-form-dialog';
import { MasterHistoryDialog } from './master-history-dialog';
import { MasterBulkImportDialog } from './master-bulk-import-dialog';
import { MasterMultiEditDialog } from './master-multi-edit-dialog';
import { deactivateMasterItemAction } from '@/lib/masters/actions';
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

function AuthorisationChips({ chips }: { chips: AuthorisationChip[] }) {
  if (chips.length === 0) {
    return <span className="text-xs text-muted-foreground">No authorisations</span>;
  }
  const visible = chips.slice(0, 4);
  const overflow = chips.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((c) => (
        <Tooltip key={c.scale_id}>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">
              <span className="font-sans font-medium">
                {RANK_SHORT[c.rank_class] ?? c.rank_class}·{TERRAIN_SHORT[c.terrain] ?? c.terrain}
              </span>
              <span className="ml-1 text-muted-foreground">
                {formatQty(c.auth_qty)} {c.uom}
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {RATION_CLASS_LABEL[c.rank_class]} — {RATION_TERRAIN_LABEL[c.terrain]} · {formatQty(c.auth_qty)} {c.uom}
          </TooltipContent>
        </Tooltip>
      ))}
      {overflow > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px]">+{overflow}</Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-0.5 text-xs">
              {chips.slice(4).map((c) => (
                <div key={c.scale_id}>
                  {RATION_CLASS_LABEL[c.rank_class]} — {RATION_TERRAIN_LABEL[c.terrain]} · {formatQty(c.auth_qty)} {c.uom}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
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
}: {
  category: Category;
  slug: CategorySlug;
  rows: MasterRow[];
  /** Map item_id → list of authorisation chips. Only populated for category='ration'. */
  authorisations?: Record<string, AuthorisationChip[]>;
  /**
   * Unit scoping for the ration view. `null` ⇒ full matrix (super admin, or a
   * unit with no mess_type/terrain configured): render the complete CLASS /
   * TERRAIN filter UI. When provided, a non-null `rankClass`/`terrain` locks
   * that dimension to a read-only label (server data is already restricted);
   * a null dimension keeps its normal filter buttons. Only `/masters` passes
   * this — admin Masters usage leaves it defaulted and is unaffected.
   */
  rationScope?: {
    rankClass: RationClass | null;
    terrain: RationTerrain | null;
  } | null;
  allowGlobal: boolean;
  defaultUnitId: string | null;
  isAllUnits: boolean;
  /**
   * UI-only gate for mutation affordances. Defaults to `true` so existing
   * admin usage is byte-unchanged. When `false`, Add / Bulk import /
   * Edit all / row Edit & Deactivate are hidden; search, table, and the
   * read-only History view remain. The server actions are still the real
   * 3-layer enforcement — this only hides controls.
   */
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const [rankFilter, setRankFilter] = useState<RationClass | 'all'>('all');
  const [terrainFilter, setTerrainFilter] = useState<RationTerrain | 'all'>('all');
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [historyOf, setHistoryOf] = useState<MasterRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [multiEditing, setMultiEditing] = useState(false);

  const columns = useMemo<ColumnDef<MasterRow>[]>(() => {
    const cols: ColumnDef<MasterRow>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.unit_id == null && (
              <Badge variant="secondary">Global</Badge>
            )}
            {!row.original.is_active && (
              <Badge variant="destructive">Inactive</Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {getValue<string>() ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'uom',
        header: 'UoM',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular-nums">
            {getValue<string>() ?? '—'}
          </span>
        ),
      },
    ];

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
      header: 'Updated',
      cell: ({ getValue }) => {
        const v = getValue<string>();
        return (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {v ? new Date(v).toLocaleDateString() : '—'}
          </span>
        );
      },
    });

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
              {canWrite ? (
                <DropdownMenuItem onClick={() => setEditing(row.original)}>
                  Edit
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => setHistoryOf(row.original)}>
                History
              </DropdownMenuItem>
              {canWrite ? (
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
      ),
    });

    return cols;
  }, [category, router, authorisations, rankFilter, terrainFilter]);

  const tableState = useMemo(
    () => ({
      columnFilters: filter ? [{ id: 'name', value: filter }] : [],
    }),
    [filter],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: tableState,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const closeForm = useCallback(() => {
    setCreating(false);
    setEditing(null);
  }, []);
  const closeHistory = useCallback(() => setHistoryOf(null), []);
  const closeImport = useCallback(() => setImporting(false), []);
  const closeMultiEdit = useCallback(() => setMultiEditing(false), []);
  const handleImported = useCallback(() => router.refresh(), [router]);
  const formOpen = creating || editing != null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex-1" />
        {canWrite ? (
          <>
            <Button
              variant="outline"
              onClick={() => setMultiEditing(true)}
              disabled={rows.length === 0}
              className="transition-ds"
            >
              <Pencil className="size-4 mr-1" /> Edit all
            </Button>
            <Button variant="outline" onClick={() => setImporting(true)} className="transition-ds">
              <Upload className="size-4 mr-1" /> Bulk import
            </Button>
            <Button onClick={() => setCreating(true)} className="transition-ds press">
              <Plus className="size-4 mr-1" /> Add
            </Button>
          </>
        ) : null}
      </div>

      {/* Ration filter pills. A locked dimension (unit-scoped, non-super-admin)
          renders a read-only label instead of buttons — the server already
          restricted the data, so "All / other" buttons would be misleading. */}
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

      {/* Data table */}
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
                    title="No items yet"
                    description="Add the first item or import via CSV."
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

      {canWrite && formOpen ? (
        <MasterFormDialog
          open
          mode={editing ? 'edit' : 'create'}
          category={category}
          slug={slug}
          item={editing}
          allowGlobal={allowGlobal}
          defaultUnitId={defaultUnitId}
          onClose={closeForm}
        />
      ) : null}
      {historyOf ? (
        <MasterHistoryDialog item={historyOf} open onClose={closeHistory} />
      ) : null}
      {canWrite && importing ? (
        <MasterBulkImportDialog
          open
          category={category}
          unitId={defaultUnitId}
          isAllUnits={isAllUnits}
          onClose={closeImport}
          onImported={handleImported}
        />
      ) : null}
      {canWrite && multiEditing ? (
        <MasterMultiEditDialog
          open
          category={category}
          rows={rows}
          onClose={closeMultiEdit}
        />
      ) : null}
    </div>
  );
}
