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
  FieldSet,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FormError } from '@/components/shared/form-error';
import { createMasterItemAction } from '@/lib/masters/actions';
import { CATEGORY_META, slugFromCategory } from '@/lib/masters/categories';
import type { InventoryCategory } from '@/lib/masters/categories';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/lib/auth/context';

type ActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
} | null;

const UOM_OPTIONS = ['kg', 'g', 'l', 'ml', 'piece', 'pack', 'bottle'] as const;

/**
 * Self-contained master-item creation dialog.
 *
 * This is a SEPARATE Radix Dialog from the add-lot dialog. `DialogContent`
 * portals to `document.body`, so this dialog's `<form>` is never DOM-nested
 * inside the lot form — exactly one `<form>` lives here; the only submit
 * button is `type="submit"`, every other control is `type="button"` (Radix
 * triggers) or non-button.
 *
 * Reuses `createMasterItemAction` as-is (it enforces masters.write /
 * .global itself — the real gate). Category is locked to the active
 * inventory tab and the item is scoped to the active unit. On success it
 * reports the created item back to the parent via `onCreated(...)` so the
 * add-lot dialog can select it immediately.
 */
export function AddMasterItemDialog({
  open,
  category,
  onClose,
  onCreated,
}: {
  open: boolean;
  category: InventoryCategory;
  onClose: () => void;
  onCreated: (item: {
    id: string;
    name: string;
    category: InventoryCategory;
    uom: string;
  }) => void;
}) {
  const { activeUnitId } = useAppContext();
  const [name, setName] = useState('');
  const [uom, setUom] = useState<string>(CATEGORY_META[slugFromCategory(category)]?.defaultUom ?? 'piece');

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createMasterItemAction,
    null,
  );

  useActionResult(state, {
    onOk: () => {
      toast.success('Master item added');
      if (state?.id) {
        onCreated({ id: state.id, name: name.trim(), category, uom });
      }
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="New master item"
      description="Add an item to this unit's catalogue so you can record stock for it."
      contentClassName="sm:max-w-md"
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
            form="add-master-item-form"
            disabled={pending}
            className="transition-ds press"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add master item'
            )}
          </Button>
        </>
      }
    >
      <form
        id="add-master-item-form"
        action={formAction}
        className="space-y-5"
      >
          <input type="hidden" name="unit_id" value={activeUnitId || ''} />
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="initial_rate" value="0" />
          <input type="hidden" name="uom" value={uom} />

          <FieldSet>
            <Field>
              <FieldLabel htmlFor="mi-name">
                Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="mi-name"
                name="name"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby="mi-name-help"
                placeholder="e.g. Old Monk Rum"
              />
              <FieldDescription id="mi-name-help">
                The exact item name as it should appear (e.g. &quot;Old Monk
                Rum&quot;).
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="mi-uom">
                Unit of measure <span className="text-destructive">*</span>
              </FieldLabel>
              <Select value={uom} onValueChange={setUom}>
                <SelectTrigger id="mi-uom" aria-describedby="mi-uom-help">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UOM_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription id="mi-uom-help">
                Base unit for the catalogue entry.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="mi-sku">SKU</FieldLabel>
              <Input
                id="mi-sku"
                name="sku"
                maxLength={50}
                aria-describedby="mi-sku-help"
                placeholder="Optional"
              />
              <FieldDescription id="mi-sku-help">
                Internal code, if you use one.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Category</FieldLabel>
              <div>
                <Badge variant="secondary">
                  {CATEGORY_META[slugFromCategory(category)]?.title ?? category}
                </Badge>
              </div>
              <FieldDescription>
                Pricing is set per purchase lot, not here.
              </FieldDescription>
            </Field>
          </FieldSet>

          <FormError message={state?.error} />
        </form>
    </AdaptiveModal>
  );
}
