'use client';

import { useActionState, useState } from 'react';
import { useActionResult } from '@/hooks/use-action-result';
import { DialogFooter } from '@/components/ui/dialog';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldDescription,
  FieldLabel,
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
import { createPackSizeAction } from '@/lib/inventory/actions';
import { CATEGORY_PACK_KIND } from '@/lib/masters/categories';
import type { InventoryCategory } from '@/lib/masters/categories';
import {
  derivedUnitsPerPack,
  servingLabel,
  pluralize,
  PEG_ML,
} from '@/lib/inventory/compute';
import { toast } from 'sonner';
import { Loader2, Ruler } from 'lucide-react';

type ActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
} | null;

/**
 * Self-contained pack-size creation dialog.
 *
 * This is a SEPARATE Radix Dialog from the add-lot dialog. `DialogContent`
 * portals to `document.body`, so this dialog's `<form>` is never DOM-nested
 * inside the lot form — the previous inline-form approach produced invalid
 * nested `<form>` markup and submitted the outer lot form on Enter. Exactly
 * one `<form>` lives here; the only submit button is `type="submit"`, every
 * other control is `type="button"` (Radix triggers) or non-button.
 *
 * On success it reports the new pack size's id back to the parent via
 * `onCreated(id)` so the add-lot dialog can select it immediately.
 */
export function AddPackSizeDialog({
  open,
  category,
  onClose,
  onCreated,
}: {
  open: boolean;
  category: InventoryCategory;
  onClose: () => void;
  onCreated: (newId: string) => void;
}) {
  const kind = CATEGORY_PACK_KIND[category];
  const isVolume = kind === 'volume';

  const [volumeUnit, setVolumeUnit] = useState<'ml' | 'L'>('ml');
  const [volumeValue, setVolumeValue] = useState('');
  const [unitCount, setUnitCount] = useState('');

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPackSizeAction,
    null,
  );

  useActionResult(state, {
    onOk: () => {
      toast.success('Pack size added');
      if (state?.id) onCreated(state.id);
    },
    onError: (msg) => toast.error(msg),
  });

  // Normalize volume to canonical millilitres (L ⇒ ×1000) so the schema
  // always receives `volume_ml` regardless of which unit the user picked.
  const volumeMl = (() => {
    const n = Number(volumeValue);
    if (!Number.isFinite(n) || n <= 0) return '';
    return String(volumeUnit === 'L' ? n * 1000 : n);
  })();

  // Live "≈ N servings" preview from the same pure helper the table uses.
  const preview = (() => {
    if (isVolume) {
      const ml = Number(volumeMl);
      if (!ml) return null;
      const upp = derivedUnitsPerPack(category, {
        kind: 'volume',
        volume_ml: ml,
        unit_count: null,
      });
      if (upp == null || upp <= 0) return null;
      const rounded = Math.round(upp * 100) / 100;
      return `≈ ${rounded} ${pluralize(rounded, servingLabel(category))} (1 ${servingLabel(category)} = ${PEG_ML} ml)`;
    }
    const n = Number(unitCount);
    if (!Number.isFinite(n) || n <= 0) return null;
    const upp = derivedUnitsPerPack(category, {
      kind: 'count',
      volume_ml: null,
      unit_count: n,
    });
    if (upp == null || upp <= 0) return null;
    return `≈ ${upp} ${pluralize(upp, servingLabel(category))} per pack`;
  })();

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="New pack size"
      description="Define a reusable container size. It becomes available for every unit, then you can pick it for this lot."
      contentClassName="sm:max-w-md"
    >
      <form action={formAction} className="space-y-5">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="sort_order" value="0" />
          {isVolume ? (
            <input type="hidden" name="volume_ml" value={volumeMl} />
          ) : (
            <input type="hidden" name="unit_count" value={unitCount} />
          )}

          <FieldSet>
            <Field>
              <FieldLabel htmlFor="ps-label">
                Label <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="ps-label"
                name="label"
                required
                maxLength={60}
                aria-describedby="ps-label-help"
                placeholder={isVolume ? 'e.g. 750 ml bottle' : 'e.g. Box of 20'}
              />
              <FieldDescription id="ps-label-help">
                A short name people will recognise in the pack-size list.
              </FieldDescription>
            </Field>

            {isVolume ? (
              <Field>
                <FieldLabel htmlFor="ps-vv">
                  Volume <span className="text-destructive">*</span>
                </FieldLabel>
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <Input
                    id="ps-vv"
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={volumeValue}
                    onChange={(e) => setVolumeValue(e.target.value)}
                    aria-describedby="ps-vv-help"
                    placeholder="750"
                  />
                  <Select
                    value={volumeUnit}
                    onValueChange={(v) => setVolumeUnit(v as 'ml' | 'L')}
                  >
                    <SelectTrigger aria-label="Volume unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <FieldDescription id="ps-vv-help">
                  Enter the volume of one container. Litres are converted to
                  millilitres automatically.
                </FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="ps-uc">
                  How many per box? <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="ps-uc"
                  type="number"
                  step="1"
                  min="1"
                  inputMode="numeric"
                  value={unitCount}
                  onChange={(e) => setUnitCount(e.target.value)}
                  aria-describedby="ps-uc-help"
                  placeholder="20"
                />
                <FieldDescription id="ps-uc-help">
                  The count of individual {pluralize(2, servingLabel(category))}{' '}
                  inside one pack.
                </FieldDescription>
              </Field>
            )}

            {preview ? (
              <p className="flex items-start gap-2 rounded-md border border-border bg-accent/50 px-3 py-2 text-xs text-foreground">
                <Ruler className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span>{preview}</span>
              </p>
            ) : null}
          </FieldSet>

          <FormError message={state?.error} />

          <DialogFooter className="pt-1">
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
              disabled={pending}
              className="transition-ds press"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add pack size'
              )}
            </Button>
          </DialogFooter>
        </form>
    </AdaptiveModal>
  );
}
