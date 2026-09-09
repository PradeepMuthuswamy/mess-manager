'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { bulkUpdateMasterItemsAction, type MasterPatch } from '@/lib/masters/actions';
import type { MasterRow } from '@/lib/masters/types';
import type { Category } from '@/lib/masters/categories';

type CatalogRow = MasterRow & {
  is_adopted?: boolean;
  local_sku?: string | null;
  menu_rate?: number | null;
  is_enabled?: boolean;
};

type UnitDraft = {
  local_sku: string;
  menu_rate: string;
  is_enabled: boolean;
};

type GlobalDraft = {
  name: string;
  sku: string;
  is_active: boolean;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function rowToUnitDraft(row: CatalogRow): UnitDraft {
  return {
    local_sku: row.local_sku ?? '',
    menu_rate: row.menu_rate != null ? String(row.menu_rate) : '',
    is_enabled: row.is_enabled ?? true,
  };
}

function rowToGlobalDraft(row: CatalogRow): GlobalDraft {
  return {
    name: row.name ?? '',
    sku: row.sku ?? '',
    is_active: row.is_active ?? true,
  };
}

function diffUnit(orig: UnitDraft, next: UnitDraft): Partial<MasterPatch> | null {
  const p: Partial<MasterPatch> = {};
  if (next.local_sku !== orig.local_sku) p.local_sku = next.local_sku.trim() || null;
  const nextRate = next.menu_rate.trim() === '' ? null : Number(next.menu_rate);
  const origRate = orig.menu_rate.trim() === '' ? null : Number(orig.menu_rate);
  if (nextRate !== origRate) {
    if (nextRate != null && !Number.isFinite(nextRate)) return null;
    if (nextRate != null) {
      p.rate = nextRate;
      p.effective_from = todayIsoDate();
    }
  }
  if (next.is_enabled !== orig.is_enabled) p.is_enabled = next.is_enabled;
  return Object.keys(p).length === 0 ? null : p;
}

function diffGlobal(orig: GlobalDraft, next: GlobalDraft): Partial<MasterPatch> | null {
  const p: Partial<MasterPatch> = {};
  if (next.name.trim() && next.name !== orig.name) p.name = next.name.trim();
  if (next.sku !== orig.sku) p.sku = next.sku.trim() || null;
  if (next.is_active !== orig.is_active) p.is_active = next.is_active;
  return Object.keys(p).length === 0 ? null : p;
}

export function MasterMultiEditDialog({
  open,
  category: _category,
  rows,
  allowGlobal = false,
  defaultUnitId = null,
  onClose,
}: {
  open: boolean;
  category: Category;
  rows: MasterRow[];
  allowGlobal?: boolean;
  defaultUnitId?: string | null;
  onClose: () => void;
}) {
  void _category;
  const router = useRouter();
  const catalogRows = rows as CatalogRow[];
  const isUnitCatalog = Boolean(defaultUnitId); // unit_id is required to patch local_sku / menu rate
  const editLocal = isUnitCatalog;
  const editGlobal = allowGlobal;

  const [unitDrafts, setUnitDrafts] = useState<Record<string, UnitDraft>>(() => {
    const d: Record<string, UnitDraft> = {};
    for (const r of catalogRows) d[r.id] = rowToUnitDraft(r);
    return d;
  });
  const [globalDrafts, setGlobalDrafts] = useState<Record<string, GlobalDraft>>(
    () => {
      const d: Record<string, GlobalDraft> = {};
      for (const r of catalogRows) d[r.id] = rowToGlobalDraft(r);
      return d;
    },
  );
  const [filter, setFilter] = useState('');
  const [pending, startTransition] = useTransition();

  const unitOriginals = useMemo(() => {
    const m: Record<string, UnitDraft> = {};
    for (const r of catalogRows) m[r.id] = rowToUnitDraft(r);
    return m;
  }, [catalogRows]);

  const globalOriginals = useMemo(() => {
    const m: Record<string, GlobalDraft> = {};
    for (const r of catalogRows) m[r.id] = rowToGlobalDraft(r);
    return m;
  }, [catalogRows]);

  const dirtyIds = useMemo(() => {
    const ids: string[] = [];
    for (const r of catalogRows) {
      const unitDirty =
        editLocal &&
        unitOriginals[r.id] &&
        unitDrafts[r.id] &&
        diffUnit(unitOriginals[r.id], unitDrafts[r.id]) != null;
      const globalDirty =
        editGlobal &&
        globalOriginals[r.id] &&
        globalDrafts[r.id] &&
        diffGlobal(globalOriginals[r.id], globalDrafts[r.id]) != null;
      if (unitDirty || globalDirty) ids.push(r.id);
    }
    return ids;
  }, [
    catalogRows,
    editLocal,
    editGlobal,
    unitDrafts,
    globalDrafts,
    unitOriginals,
    globalOriginals,
  ]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return catalogRows;
    return catalogRows.filter((r) =>
      [r.name, r.sku ?? '', r.local_sku ?? ''].some((s) =>
        s.toLowerCase().includes(needle),
      ),
    );
  }, [catalogRows, filter]);

  function patchUnit(id: string, mutate: (d: UnitDraft) => UnitDraft) {
    setUnitDrafts((prev) => ({ ...prev, [id]: mutate(prev[id]) }));
  }

  function patchGlobal(id: string, mutate: (d: GlobalDraft) => GlobalDraft) {
    setGlobalDrafts((prev) => ({ ...prev, [id]: mutate(prev[id]) }));
  }

  function bulkToggleEnabled(enabled: boolean) {
    const mutation: Record<string, UnitDraft> = {};
    for (const r of visible) {
      mutation[r.id] = { ...unitDrafts[r.id], is_enabled: enabled };
    }
    setUnitDrafts((prev) => ({ ...prev, ...mutation }));
    toast.success(`Set ${visible.length} items to ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  function bulkToggleStatus(active: boolean) {
    const mutation: Record<string, GlobalDraft> = {};
    for (const r of visible) {
      mutation[r.id] = { ...globalDrafts[r.id], is_active: active };
    }
    setGlobalDrafts((prev) => ({ ...prev, ...mutation }));
    toast.success(`Set ${visible.length} items to ${active ? 'Active' : 'Inactive'}`);
  }

  function resetRow(id: string) {
    if (editLocal) {
      setUnitDrafts((prev) => ({ ...prev, [id]: unitOriginals[id] }));
    }
    if (editGlobal) {
      setGlobalDrafts((prev) => ({ ...prev, [id]: globalOriginals[id] }));
    }
  }

  function handleSave() {
    if (dirtyIds.length === 0) {
      toast.info('No changes to save');
      return;
    }
    const patches: MasterPatch[] = [];
    for (const id of dirtyIds) {
      const unitDiff =
        editLocal && unitOriginals[id] && unitDrafts[id]
          ? diffUnit(unitOriginals[id], unitDrafts[id])
          : null;
      const globalDiff =
        editGlobal && globalOriginals[id] && globalDrafts[id]
          ? diffGlobal(globalOriginals[id], globalDrafts[id])
          : null;
      if (unitDiff || globalDiff) {
        patches.push({ id, ...globalDiff, ...unitDiff });
      }
    }
    startTransition(async () => {
      const res = await bulkUpdateMasterItemsAction({
        patches,
        unit_id: defaultUnitId,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const { updated, failed, errors } = res.result!;
      if (failed === 0) {
        toast.success(`Saved ${updated} change${updated === 1 ? '' : 's'}`);
        router.refresh();
        onClose();
        return;
      }
      toast.warning(`Saved ${updated}, ${failed} failed`, {
        description:
          errors
            .slice(0, 3)
            .map((e) => e.message)
            .join('\n') +
          (errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''),
      });
      router.refresh();
    });
  }

  const colCount =
    1 + (editLocal ? 3 : 0) + (editGlobal ? 3 : 0) + 1;

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={`Edit all ${rows.length} item${rows.length === 1 ? '' : 's'}`}
      description={
        editLocal && !editGlobal
          ? 'Edit local SKU, menu rate, and adoption. Product names stay on the global catalog.'
          : 'Edit any field inline. Only changed rows are saved when you click Save.'
      }
      contentClassName="sm:max-w-5xl max-h-[85vh]"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
            className="transition-ds"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || dirtyIds.length === 0}
            className="transition-ds press"
          >
            {pending
              ? 'Saving...'
              : `Save ${dirtyIds.length} change${dirtyIds.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            {editLocal ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => bulkToggleEnabled(true)}
                  disabled={visible.length === 0}
                  className="text-xs"
                >
                  Mark enabled
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => bulkToggleEnabled(false)}
                  disabled={visible.length === 0}
                  className="text-xs text-destructive"
                >
                  Mark disabled
                </Button>
              </>
            ) : null}
            {editGlobal ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => bulkToggleStatus(true)}
                  disabled={visible.length === 0}
                  className="text-xs"
                >
                  Mark Active
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => bulkToggleStatus(false)}
                  disabled={visible.length === 0}
                  className="text-xs text-destructive"
                >
                  Mark Inactive
                </Button>
              </>
            ) : null}
          </div>
          <div className="flex-1" />
          <Badge
            variant={dirtyIds.length > 0 ? 'default' : 'secondary'}
            className="tabular-nums"
          >
            {dirtyIds.length} pending change{dirtyIds.length === 1 ? '' : 's'}
          </Badge>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="min-w-[200px] text-xs font-medium">
                  Product
                </TableHead>
                {editLocal ? (
                  <>
                    <TableHead className="min-w-[140px] text-xs font-medium">
                      Local SKU
                    </TableHead>
                    <TableHead className="min-w-[120px] text-xs font-medium">
                      Menu rate
                    </TableHead>
                    <TableHead className="text-xs font-medium">Adopted</TableHead>
                  </>
                ) : null}
                {editGlobal ? (
                  <>
                    <TableHead className="min-w-[200px] text-xs font-medium">
                      Product name
                    </TableHead>
                    <TableHead className="min-w-[140px] text-xs font-medium">
                      SKU
                    </TableHead>
                    <TableHead className="text-xs font-medium">Status</TableHead>
                  </>
                ) : null}
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colCount}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No matching items.
                  </TableCell>
                </TableRow>
              ) : null}
              {visible.map((r) => {
                const ud = unitDrafts[r.id];
                const gd = globalDrafts[r.id];
                const uo = unitOriginals[r.id];
                const go = globalOriginals[r.id];
                if ((editLocal && (!ud || !uo)) || (editGlobal && (!gd || !go))) {
                  return null;
                }
                const isDirty =
                  (editLocal && ud && uo && diffUnit(uo, ud) != null) ||
                  (editGlobal && gd && go && diffGlobal(go, gd) != null);
                return (
                  <TableRow
                    key={r.id}
                    data-dirty={isDirty || undefined}
                    className="data-[dirty=true]:bg-accent/30"
                  >
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">
                          {r.name}
                        </span>
                        {r.is_adopted ? (
                          <Badge variant="success">Adopted</Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            Not adopted
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {editLocal && ud ? (
                      <>
                        <TableCell>
                          <Input
                            value={ud.local_sku}
                            onChange={(e) =>
                              patchUnit(r.id, (cur) => ({
                                ...cur,
                                local_sku: e.currentTarget.value,
                              }))
                            }
                            className="h-8 font-mono text-xs"
                            placeholder="—"
                            disabled={!r.is_adopted}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={ud.menu_rate}
                            onChange={(e) =>
                              patchUnit(r.id, (cur) => ({
                                ...cur,
                                menu_rate: e.currentTarget.value,
                              }))
                            }
                            className="h-8 font-mono text-xs"
                            placeholder="—"
                            disabled={!r.is_adopted}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={ud.is_enabled ? 'true' : 'false'}
                            onValueChange={(v) =>
                              patchUnit(r.id, (cur) => ({
                                ...cur,
                                is_enabled: v === 'true',
                              }))
                            }
                            disabled={!r.is_adopted}
                          >
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Enabled</SelectItem>
                              <SelectItem value="false">Disabled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </>
                    ) : null}
                    {editGlobal && gd ? (
                      <>
                        <TableCell>
                          <Input
                            value={gd.name}
                            onChange={(e) =>
                              patchGlobal(r.id, (cur) => ({
                                ...cur,
                                name: e.currentTarget.value,
                              }))
                            }
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={gd.sku}
                            onChange={(e) =>
                              patchGlobal(r.id, (cur) => ({
                                ...cur,
                                sku: e.currentTarget.value,
                              }))
                            }
                            className="h-8 font-mono text-xs"
                            placeholder="—"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={gd.is_active ? 'true' : 'false'}
                            onValueChange={(v) =>
                              patchGlobal(r.id, (cur) => ({
                                ...cur,
                                is_active: v === 'true',
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Active</SelectItem>
                              <SelectItem value="false">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell className="text-right">
                      {isDirty ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => resetRow(r.id)}
                          className="text-muted-foreground transition-ds"
                        >
                          Reset
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdaptiveModal>
  );
}
