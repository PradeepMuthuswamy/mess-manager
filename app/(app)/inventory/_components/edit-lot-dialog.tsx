'use client';

import { useActionState, useState } from 'react';
import { useActionResult } from '@/hooks/use-action-result';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormError } from '@/components/shared/form-error';
import { updateLotAction, adjustQtyAction } from '@/lib/inventory/actions';
import { containerLabel, pluralize } from '@/lib/inventory/compute';
import type { InventoryLotRow, PackSize } from '@/lib/inventory/types';
import { toast } from 'sonner';
import { Loader2, Save, SlidersHorizontal } from 'lucide-react';

type ActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
} | null;

/**
 * Quantity correction. This is a SEPARATE `<form>` rendered as a SIBLING of
 * the edit form inside `DialogContent` (never nested — two sibling forms is
 * valid HTML). Its only submit button is `type="submit"`.
 */
function AdjustQtyForm({
  lot,
  onChanged,
}: {
  lot: InventoryLotRow;
  onChanged: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    adjustQtyAction,
    null,
  );
  useActionResult(state, {
    onOk: () => {
      toast.success('Quantity adjusted');
      onChanged();
    },
    onError: (msg) => toast.error(msg),
  });

  const c = containerLabel(lot.category ?? '', {
    kind: lot.kind,
    label: lot.pack_label,
  });

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
    >
      <input type="hidden" name="id" value={lot.id ?? ''} />
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Correct stock on hand
        </h3>
      </div>
      <Field>
        <FieldLabel htmlFor="adjust-qty">
          Set the number of {pluralize(2, c)} on hand{' '}
          <span className="text-destructive">*</span>
        </FieldLabel>
        <div className="flex items-start gap-2">
          <Input
            id="adjust-qty"
            name="qty_packs"
            type="number"
            step="any"
            min="0"
            required
            inputMode="decimal"
            defaultValue={lot.qty_packs ?? 0}
            aria-describedby="adjust-qty-help"
            className="max-w-[10rem]"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending}
            className="transition-ds press"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Set quantity'
            )}
          </Button>
        </div>
        <FieldDescription id="adjust-qty-help">
          Overwrites the current {c} count for this lot — use it to fix a
          miscount, not to record a new purchase.
        </FieldDescription>
      </Field>
      <FormError message={state?.error} />
    </form>
  );
}

export function EditLotDialog({
  open,
  lot,
  packSizes,
  onClose,
  onChanged,
}: {
  open: boolean;
  lot: InventoryLotRow;
  packSizes: PackSize[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [packSizeId, setPackSizeId] = useState(lot.pack_size_id ?? '');
  const [isActive, setIsActive] = useState<'true' | 'false'>(
    lot.is_active ? 'true' : 'false',
  );
  const selectedPack = packSizes.find((ps) => ps.id === packSizeId) ?? null;
  const c = containerLabel(lot.category ?? '', {
    kind: selectedPack?.kind ?? lot.kind,
    label: selectedPack?.label ?? lot.pack_label,
  });

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateLotAction,
    null,
  );

  useActionResult(state, {
    onOk: () => {
      toast.success('Lot updated');
      onChanged();
      onClose();
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Edit lot"
      description={`Update ${lot.item_name ?? 'this lot'}'s pack, price and source. Each price is a separate lot — change this one only to fix a mistake.`}
    >
      <form action={formAction} className="space-y-6">
          <input type="hidden" name="id" value={lot.id ?? ''} />
          <input type="hidden" name="pack_size_id" value={packSizeId} />
          <input type="hidden" name="is_active" value={isActive} />

          <FieldSet>
            <FieldLegend className="text-sm font-semibold text-foreground">
              Item &amp; pack
            </FieldLegend>

            <Field>
              <FieldLabel htmlFor="edit-pack-size">
                Pack size <span className="text-destructive">*</span>
              </FieldLabel>
              <Select value={packSizeId} onValueChange={setPackSizeId}>
                <SelectTrigger
                  id="edit-pack-size"
                  aria-describedby="edit-pack-size-help"
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
              <FieldDescription id="edit-pack-size-help">
                The bottle/box size this lot was bought in.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-active">Status</FieldLabel>
              <Select
                value={isActive}
                onValueChange={(v) => setIsActive(v as 'true' | 'false')}
              >
                <SelectTrigger
                  id="edit-active"
                  aria-describedby="edit-active-help"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription id="edit-active-help">
                Inactive lots stay on record but are hidden from day-to-day
                stock.
              </FieldDescription>
            </Field>
          </FieldSet>

          <FieldSet>
            <FieldLegend className="text-sm font-semibold text-foreground">
              Price
            </FieldLegend>

            <Field>
              <FieldLabel htmlFor="edit-rate">Price per {c} (₹)</FieldLabel>
              <Input
                id="edit-rate"
                name="rate"
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                defaultValue={lot.rate ?? ''}
                aria-describedby="edit-rate-help"
                placeholder="e.g. 850"
              />
              <FieldDescription id="edit-rate-help">
                What one {c} cost at purchase. Leave as-is unless the original
                entry was wrong.
              </FieldDescription>
            </Field>
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
                <FieldLabel htmlFor="edit-acquired_on">Acquired on</FieldLabel>
                <Input
                  id="edit-acquired_on"
                  name="acquired_on"
                  type="date"
                  defaultValue={lot.acquired_on ?? ''}
                  aria-describedby="edit-acquired-help"
                />
                <FieldDescription id="edit-acquired-help">
                  When you bought it — helps trace older stock.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-source">Source</FieldLabel>
                <Input
                  id="edit-source"
                  name="source"
                  maxLength={120}
                  defaultValue={lot.source ?? ''}
                  aria-describedby="edit-source-help"
                  placeholder="Shop / canteen"
                />
                <FieldDescription id="edit-source-help">
                  Where you bought it — helps trace older stock.
                </FieldDescription>
              </Field>
            </div>
          </FieldSet>

          <FormError message={state?.error} />

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
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
              disabled={pending || !packSizeId}
              className="transition-ds press"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </form>

        <Separator />

        <AdjustQtyForm lot={lot} onChanged={onChanged} />
    </AdaptiveModal>
  );
}
