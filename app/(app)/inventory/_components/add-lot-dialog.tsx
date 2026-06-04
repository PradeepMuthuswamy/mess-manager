'use client';

import { useActionState, useState } from 'react';
import { useActionResult } from '@/hooks/use-action-result';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormError } from '@/components/shared/form-error';
import { createLotAction } from '@/lib/inventory/actions';
import type { PackSize, MasterItemPick } from '@/lib/inventory/types';
import { CATEGORY_META } from '@/lib/masters/categories';
import type { Category, InventoryCategory } from '@/lib/masters/categories';
import {
  derivedUnitsPerPack,
  servingLabel,
  containerLabel,
  pluralize,
  PEG_ML,
} from '@/lib/inventory/compute';
import { toast } from 'sonner';
import {
  Check,
  ChevronsUpDown,
  Loader2,
  PackagePlus,
  Plus,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddPackSizeDialog } from './add-pack-size-dialog';
import { AddMasterItemDialog } from './add-master-item-dialog';

type ActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
} | null;

function categoryLabel(category: Category): string {
  return CATEGORY_META[category]?.title ?? category;
}

/**
 * Plain-language explanation of how many servings the selected pack yields.
 * Uses the frozen `derivedUnitsPerPack` / `servingLabel` helpers so the
 * callout always matches the table maths.
 */
function packServingCallout(
  category: InventoryCategory,
  pack: PackSize,
): string {
  const c = containerLabel(category, { kind: pack.kind, label: pack.label });
  const upp = derivedUnitsPerPack(category, {
    kind: pack.kind,
    volume_ml: pack.volume_ml,
    unit_count: pack.unit_count,
  });
  if (upp == null || upp <= 1) {
    return `Tracked as individual ${pluralize(2, c)}.`;
  }
  const rounded = Math.round(upp * 100) / 100;
  const measure =
    category === 'alcohol' ? ` (${servingLabel(category)} = ${PEG_ML} ml)` : '';
  return `1 ${c} (${pack.label}) ≈ ${rounded} ${pluralize(rounded, servingLabel(category))}${measure}.`;
}

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
  const selected = items.find((i) => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-describedby="item-help"
          className="w-full justify-between font-normal"
        >
          <span className={cn(!selected && 'text-muted-foreground')}>
            {selected
              ? `${selected.name} (${categoryLabel(selected.category)})`
              : 'Search master items...'}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search items..." />
          <CommandList>
            <CommandEmpty>No items found.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${categoryLabel(item.category)}`}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'size-4',
                      item.id === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex-1">
                    {item.name}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({categoryLabel(item.category)})
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.uom}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
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
                <Plus className="size-3.5" />
                New master item
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AddLotDialog({
  open,
  unitId,
  category,
  masterItems,
  packSizes,
  canManagePackSizes,
  canManageMasters,
  onClose,
  onChanged,
}: {
  open: boolean;
  unitId: string;
  category: InventoryCategory;
  masterItems: MasterItemPick[];
  packSizes: PackSize[];
  canManagePackSizes: boolean;
  canManageMasters: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  // Server already scopes the picker to the active tab's category and hard-
  // excludes ration; filter again defensively so it is impossible to add a
  // wrong-category item. `category` is an InventoryCategory (never
  // `ration`), so an exact match already excludes ration items too.
  const scopedItems = masterItems.filter((i) => i.category === category);
  // Local copy of the picker list so a freshly created master item can be
  // shown and selected immediately. `onChanged()` revalidates /inventory so
  // the refreshed `masterItems` prop will carry the row on the next mount.
  const [extraItems, setExtraItems] = useState<MasterItemPick[]>([]);
  const pickerItems = [...extraItems, ...scopedItems];
  const [itemId, setItemId] = useState('');
  const [packSizeId, setPackSizeId] = useState('');
  const [showNewPackSize, setShowNewPackSize] = useState(false);
  const [showNewMasterItem, setShowNewMasterItem] = useState(false);
  const selectedPack = packSizes.find((ps) => ps.id === packSizeId) ?? null;

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createLotAction,
    null,
  );

  useActionResult(state, {
    onOk: () => {
      toast.success('Lot added to inventory');
      onChanged();
      onClose();
    },
    onError: (msg) => toast.error(msg),
  });

  const lc = categoryLabel(category).toLowerCase();
  // Container noun for the chosen pack; before a pack is selected fall back
  // to the category default (label:null ⇒ e.g. soft_drink ⇒ "bottle").
  const c = containerLabel(category, {
    kind: selectedPack?.kind ?? null,
    label: selectedPack?.label ?? null,
  });

  return (
    <>
      <AdaptiveModal
        open={open}
        onClose={onClose}
        title={`Add ${lc} to inventory`}
        description="Record what you bought, how much, and what it cost. The same item bought at a different price is a separate entry."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={pending}
              className="transition-ds"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-lot-form"
              disabled={pending || !itemId || !packSizeId}
              className="transition-ds press"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <PackagePlus className="size-4" />
                  Add lot
                </>
              )}
            </Button>
          </>
        }
      >
        <form id="add-lot-form" action={formAction} className="space-y-6">
            <input type="hidden" name="unit_id" value={unitId} />
            <input type="hidden" name="item_id" value={itemId} />
            <input type="hidden" name="pack_size_id" value={packSizeId} />

            <FieldSet>
              <FieldLegend className="text-sm font-semibold text-foreground">
                Item &amp; pack
              </FieldLegend>

              <Field>
                <FieldLabel htmlFor="item-picker">
                  Master item <span className="text-destructive">*</span>
                </FieldLabel>
                <div id="item-picker">
                  <ItemPicker
                    items={pickerItems}
                    value={itemId}
                    onChange={setItemId}
                    onCreateNew={
                      canManageMasters
                        ? () => setShowNewMasterItem(true)
                        : undefined
                    }
                  />
                </div>
                <FieldDescription id="item-help">
                  Pick the item you purchased.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="pack-size">
                  Pack size <span className="text-destructive">*</span>
                </FieldLabel>
                <Select value={packSizeId} onValueChange={setPackSizeId}>
                  <SelectTrigger
                    id="pack-size"
                    aria-describedby="pack-size-help"
                  >
                    <SelectValue placeholder="Select a pack size" />
                  </SelectTrigger>
                  <SelectContent>
                    {packSizes.map((ps) => (
                      <SelectItem key={ps.id} value={ps.id}>
                        {ps.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription id="pack-size-help">
                  The bottle/box size you bought it in.
                </FieldDescription>
                {selectedPack ? (
                  <p className="flex items-start gap-2 rounded-md border border-border bg-accent/50 px-3 py-2 text-xs text-foreground">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>{packServingCallout(category, selectedPack)}</span>
                  </p>
                ) : null}
                {canManagePackSizes ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewPackSize(true)}
                    className="transition-ds w-fit"
                  >
                    <Plus className="size-3.5" />
                    New pack size
                  </Button>
                ) : null}
              </Field>
            </FieldSet>

            <FieldSet>
              <FieldLegend className="text-sm font-semibold text-foreground">
                Stock &amp; price
              </FieldLegend>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="qty_packs">
                    How many {pluralize(2, c)}?{' '}
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="qty_packs"
                    name="qty_packs"
                    type="number"
                    step="any"
                    min="0"
                    required
                    inputMode="decimal"
                    aria-describedby="qty-help"
                    placeholder="e.g. 12"
                  />
                  <FieldDescription id="qty-help">
                    Number of {pluralize(2, c)} you bought. Decimals allowed for
                    a part-{c} (e.g. 1.5).
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="rate">
                    Price per {c} (₹){' '}
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="rate"
                    name="rate"
                    type="number"
                    step="any"
                    min="0"
                    required
                    inputMode="decimal"
                    aria-describedby="rate-help"
                    placeholder="e.g. 850"
                  />
                  <FieldDescription id="rate-help">
                    What one {c} cost at purchase. Different shops or dates can
                    differ — that&apos;s fine, it&apos;s a separate lot.
                  </FieldDescription>
                </Field>
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend className="text-sm font-semibold text-foreground">
                Where it came from{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLegend>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="acquired_on">Acquired on</FieldLabel>
                  <Input
                    id="acquired_on"
                    name="acquired_on"
                    type="date"
                    aria-describedby="acquired-help"
                  />
                  <FieldDescription id="acquired-help">
                    When you bought it — helps trace older stock.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="source">Source</FieldLabel>
                  <Input
                    id="source"
                    name="source"
                    maxLength={120}
                    aria-describedby="source-help"
                    placeholder="Shop / canteen"
                  />
                  <FieldDescription id="source-help">
                    Where you bought it — helps trace older stock.
                  </FieldDescription>
                </Field>
              </div>
            </FieldSet>

            <FormError message={state?.error} />
          </form>
      </AdaptiveModal>

      {canManagePackSizes && showNewPackSize ? (
        <AddPackSizeDialog
          open
          category={category}
          onClose={() => setShowNewPackSize(false)}
          onCreated={(newId) => {
            setShowNewPackSize(false);
            // Optimistically select the new id now; `onChanged()` revalidates
            // /inventory so the refreshed `packSizes` prop will carry this
            // row and the Select resolves its label on the next render. No
            // effect needed — selection is set directly from the callback.
            setPackSizeId(newId);
            onChanged();
          }}
        />
      ) : null}

      {canManageMasters && showNewMasterItem ? (
        <AddMasterItemDialog
          open
          unitId={unitId}
          category={category}
          onClose={() => setShowNewMasterItem(false)}
          onCreated={(item) => {
            setShowNewMasterItem(false);
            // Insert into the in-memory picker list and select it now.
            // `onChanged()` revalidates /inventory so the refreshed
            // `masterItems` prop carries this row on the next mount.
            setExtraItems((prev) =>
              prev.some((i) => i.id === item.id) ? prev : [item, ...prev],
            );
            setItemId(item.id);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
