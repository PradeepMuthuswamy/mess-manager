'use client';

import { useCallback, useMemo, useState } from 'react';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { createLotsAction } from '@/lib/stock/actions';
import type { MasterItemPick } from '@/lib/stock/types';
import { CATEGORY_META, slugFromCategory } from '@/lib/masters/categories';
import type { Category, InventoryCategory } from '@/lib/masters/categories';
import {
  derivedUnitsPerPack,
  servingLabel,
  containerLabel,
  pluralize,
  PEG_ML,
} from '@/lib/stock/compute';
import { toast } from 'sonner';
import {
  Loader2,
  PackagePlus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/lib/auth/context';

type DraftLot = {
  id: string;
  variantId: string;
  variantName: string;
  packLabel: string;
  qtyPacks: number;
  rate: number;
  acquiredOn: string | null;
  source: string | null;
};

function categoryLabel(category: Category): string {
  return CATEGORY_META[slugFromCategory(category)]?.title ?? category;
}

/** Searchable combobox over the unit's master items. Self-contained: holds only
 *  its own open state; selection is lifted to the parent via `onChange`. */
function ItemPicker({
  items,
  value,
  onChange,
  onCreateNew,
}: {
  items: MasterItemPick[];
  value: string;
  onChange: (id: string) => void;
  onCreateNew?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => items.find((i) => i.id === value) ?? null,
    [items, value],
  );

  const handleSelect = useCallback(
    (val: unknown) => {
      const item = val as MasterItemPick | null;
      if (item) {
        onChange(item.id);
      }
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Combobox
      open={open}
      onOpenChange={setOpen}
      value={selected}
      onValueChange={handleSelect}
      items={items}
      itemToStringValue={(it) => (it as MasterItemPick).id}
      itemToStringLabel={(it) => (it as MasterItemPick).name}
    >
      <ComboboxInput
        placeholder="Search master items..."
        className="w-full h-10"
        aria-describedby="item-help"
      />
      <ComboboxContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <ComboboxList>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          {items.map((item) => (
            <ComboboxItem
              key={item.id}
              value={item}
            >
              <div className="flex flex-col flex-1 min-w-0 font-sans">
                <span className="truncate font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  {item.pack_label && (
                    <span className="font-semibold px-1 rounded bg-muted text-foreground">
                      {item.pack_label}
                    </span>
                  )}
                  <span>({categoryLabel(item.category)})</span>
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground ml-2 shrink-0">
                {item.uom}
              </span>
            </ComboboxItem>
          ))}
        </ComboboxList>
        {onCreateNew ? (
          <div className="border-t border-border p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                onCreateNew();
              }}
              className="transition-ds w-full justify-start font-normal"
            >
              <Plus className="size-3.5 mr-1" />
              New master item
            </Button>
          </div>
        ) : null}
      </ComboboxContent>
    </Combobox>
  );
}

export function AddStockDialog({
  open,
  category,
  masterItems,
  extraItems,
  itemId,
  setItemId,
  canManageMasters,
  onClose,
  onChanged,
  onCreateMasterItem,
}: {
  open: boolean;
  category: InventoryCategory;
  masterItems: MasterItemPick[];
  extraItems: MasterItemPick[];
  itemId: string;
  setItemId: (id: string) => void;
  canManageMasters: boolean;
  onClose: () => void;
  onChanged: () => void;
  onCreateMasterItem: () => void;
}) {
  const { activeUnitId } = useAppContext();

  // Derived picker list — memoized so the array identity (and therefore the
  // combobox item list) stays stable across re-renders that don't change inputs.
  const pickerItems = useMemo(() => {
    const scoped = masterItems.filter((i) => i.category === category);
    return [...extraItems, ...scoped];
  }, [masterItems, extraItems, category]);

  // Draft list — staged lots not yet persisted.
  const [draftLots, setDraftLots] = useState<DraftLot[]>([]);

  // Current row inputs.
  const [qtyPacks, setQtyPacks] = useState('');
  const [rate, setRate] = useState('');
  const [acquiredOn, setAcquiredOn] = useState('');
  const [source, setSource] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  const selectedItem = useMemo(
    () => pickerItems.find((i) => i.id === itemId) ?? null,
    [pickerItems, itemId],
  );

  const handleAddToList = useCallback(() => {
    if (!itemId) {
      toast.error('Please select a master item');
      return;
    }
    const qty = parseFloat(qtyPacks);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a quantity greater than zero');
      return;
    }
    const r = parseFloat(rate);
    if (isNaN(r) || r <= 0) {
      toast.error('Please enter a price greater than zero');
      return;
    }

    const item = pickerItems.find((i) => i.id === itemId) ?? null;
    const newDraft: DraftLot = {
      id: crypto.randomUUID(),
      variantId: itemId,
      variantName: item?.name ?? '',
      packLabel: item?.pack_label ?? '',
      qtyPacks: qty,
      rate: r,
      acquiredOn: acquiredOn || null,
      source: source || null,
    };

    setDraftLots((prev) => [...prev, newDraft]);
    toast.success(`Added ${item?.name ?? 'item'} to draft list`);

    // Reset item-specific inputs; keep acquiredOn/source for quick repeat entry.
    setItemId('');
    setQtyPacks('');
    setRate('');
  }, [itemId, qtyPacks, rate, acquiredOn, source, pickerItems]);

  const removeDraft = useCallback((id: string) => {
    setDraftLots((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleSaveAll = useCallback(async () => {
    if (draftLots.length === 0) {
      toast.error('Please add at least one lot to the list before saving');
      return;
    }
    if (!activeUnitId) {
      toast.error('No active unit selected — pick a unit before saving stock');
      return;
    }

    setIsSaving(true);
    try {
      const payload = draftLots.map((d) => ({
        unit_id: activeUnitId,
        variant_id: d.variantId,
        qty_packs: d.qtyPacks,
        rate: d.rate,
        acquired_on: d.acquiredOn,
        source: d.source,
      }));

      const res = await createLotsAction(payload);
      if (res?.ok) {
        toast.success(`Successfully saved ${draftLots.length} stock lot(s)`);
        setDraftLots([]);
        onChanged();
        onClose();
      } else {
        toast.error(res?.error ?? 'Failed to save stock lots');
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'An unexpected error occurred',
      );
    } finally {
      setIsSaving(false);
    }
  }, [draftLots, activeUnitId, onChanged, onClose]);



  const lc = categoryLabel(category).toLowerCase();
  const containerNoun = containerLabel(category, {
    kind: selectedItem?.pack_kind ?? null,
    label: selectedItem?.pack_label ?? null,
  });

  const packServingCallout = (item: MasterItemPick): string => {
    const cLabel = containerLabel(category, {
      kind: item.pack_kind,
      label: item.pack_label,
    });
    const upp = derivedUnitsPerPack(category, {
      kind: item.pack_kind,
      volume_ml: item.volume_ml,
      unit_count: item.unit_count,
    });
    if (upp == null || upp <= 1) {
      return `Tracked as individual ${pluralize(2, cLabel)}.`;
    }
    const rounded = Math.round(upp * 100) / 100;
    const measure =
      category === 'alcohol' ? ` (${servingLabel(category)} = ${PEG_ML} ml)` : '';
    return `1 ${cLabel} (${item.pack_label}) ≈ ${rounded} ${pluralize(rounded, servingLabel(category))}${measure}.`;
  };

  return (
    <>
      <AdaptiveModal
        open={open}
        onClose={onClose}
        title={`Add ${lc} to stock`}
        description="Draft purchase lots and save them all at once. The same item bought at different prices can be drafted as separate rows."
        footer={
          <div className="flex w-full justify-between items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {draftLots.length} item(s) drafted
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={isSaving}
                className="transition-ds"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveAll}
                disabled={isSaving || draftLots.length === 0}
                className="transition-ds press"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1" />
                    Saving...
                  </>
                ) : (
                  <>
                    <PackagePlus className="size-4 mr-1" />
                    Save All ({draftLots.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-4 rounded-md border border-border bg-muted/20 p-4">
            <FieldSet>
              <FieldLegend className="text-sm font-semibold text-foreground">
                Lot Details
              </FieldLegend>

              <Field>
                <FieldLabel htmlFor="item-picker">
                  Product Variant <span className="text-destructive">*</span>
                </FieldLabel>
                <div id="item-picker">
                  <ItemPicker
                    items={pickerItems}
                    value={itemId}
                    onChange={setItemId}
                    onCreateNew={
                      canManageMasters
                        ? onCreateMasterItem
                        : undefined
                    }
                  />
                </div>
                <FieldDescription id="item-help">
                  Select the item variant. The variant configuration determines
                  UOM and packaging.
                </FieldDescription>
                {selectedItem ? (
                  <p className="flex items-start gap-2 rounded-md border border-border bg-accent/30 px-3 py-2 text-xs text-foreground mt-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>{packServingCallout(selectedItem)}</span>
                  </p>
                ) : null}
              </Field>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <Field>
                  <FieldLabel htmlFor="qty_packs">
                    Quantity ({pluralize(2, containerNoun)}){' '}
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="qty_packs"
                    type="number"
                    step="any"
                    min="0.001"
                    value={qtyPacks}
                    onChange={(e) => setQtyPacks(e.target.value)}
                    placeholder="e.g. 12"
                    inputMode="decimal"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="rate">
                    Price per {containerNoun} (₹){' '}
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="rate"
                    type="number"
                    step="any"
                    min="0.01"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="e.g. 850"
                    inputMode="decimal"
                  />
                </Field>
              </div>
            </FieldSet>

            <FieldSet>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="acquired_on">Acquired on</FieldLabel>
                  <Input
                    id="acquired_on"
                    type="date"
                    value={acquiredOn}
                    onChange={(e) => setAcquiredOn(e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="source">Source</FieldLabel>
                  <Input
                    id="source"
                    maxLength={120}
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="e.g. Shop / canteen"
                  />
                </Field>
              </div>
            </FieldSet>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleAddToList}
                variant="secondary"
                disabled={!itemId || !qtyPacks || !rate}
                className="transition-ds press"
              >
                <Plus className="size-4 mr-1" />
                Add to list
              </Button>
            </div>
          </div>

          {draftLots.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Drafted Items
              </h3>
              <div className="max-h-[220px] overflow-y-auto rounded-md border border-border bg-background shadow-inner">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-muted/90 text-xs font-semibold text-muted-foreground uppercase border-b border-border z-10">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-center w-[50px]">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono text-xs">
                    {draftLots.map((lotItem) => (
                      <tr key={lotItem.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-sans font-medium text-foreground">
                          {lotItem.variantName}
                          {lotItem.packLabel && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({lotItem.packLabel})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {lotItem.qtyPacks}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          ₹{lotItem.rate.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          ₹
                          {(lotItem.qtyPacks * lotItem.rate).toLocaleString(
                            'en-IN',
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeDraft(lotItem.id)}
                            className="size-7 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-ds"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </AdaptiveModal>


    </>
  );
}
