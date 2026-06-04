'use client';

import { useActionState, useState } from 'react';
import { useActionResult } from '@/hooks/use-action-result';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createMasterItemAction,
  updateMasterItemAction,
} from '@/lib/masters/actions';
import { FormError } from '@/components/shared/form-error';
import { toast } from 'sonner';
import type { MasterRow } from '@/lib/masters/types';
import { CATEGORY_META } from '@/lib/masters/categories';
import type { Category, CategorySlug } from '@/lib/masters/categories';

const UOMS = ['kg', 'g', 'l', 'ml', 'piece', 'pack', 'bottle'] as const;
type Uom = (typeof UOMS)[number];

type ActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
} | null;

export function MasterFormDialog({
  open,
  mode,
  category,
  slug,
  item,
  allowGlobal,
  defaultUnitId,
  onClose,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  category: Category;
  slug: CategorySlug;
  item: MasterRow | null;
  allowGlobal: boolean;
  defaultUnitId: string | null;
  onClose: () => void;
}) {
  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Add new item' : 'Edit item'}
      description={
        mode === 'create'
          ? `Create a new ${slug} master item.`
          : (item?.name ?? undefined)
      }
    >
      {mode === 'create' ? (
        <CreateForm
          category={category}
          allowGlobal={allowGlobal}
          defaultUnitId={defaultUnitId}
          onSuccess={onClose}
        />
      ) : item ? (
        <EditForms
          item={item}
          allowGlobal={allowGlobal}
          defaultUnitId={defaultUnitId}
          onSuccess={onClose}
        />
      ) : null}
    </AdaptiveModal>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-sm font-medium text-foreground"
    >
      {children}
    </Label>
  );
}

function CreateForm({
  category,
  allowGlobal,
  defaultUnitId,
  onSuccess,
}: {
  category: Category;
  allowGlobal: boolean;
  defaultUnitId: string | null;
  onSuccess: () => void;
}) {
  const [scope, setScope] = useState<'unit' | 'global'>(
    defaultUnitId ? 'unit' : 'global',
  );
  const [uom, setUom] = useState<Uom>(CATEGORY_META[category].defaultUom);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createMasterItemAction,
    null,
  );

  useActionResult(state, {
    onOk: () => {
      toast.success('Item created');
      onSuccess();
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="category" value={category} />
      {/* Server schema still requires an initial rate — UI is hidden, default to 0. */}
      <input type="hidden" name="initial_rate" value="0" />
      {scope === 'unit' && defaultUnitId ? (
        <input type="hidden" name="unit_id" value={defaultUnitId} />
      ) : null}

      {allowGlobal && (
        <FieldGroup>
          <FieldLabel>Scope</FieldLabel>
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as 'unit' | 'global')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {defaultUnitId && (
                <SelectItem value="unit">This unit only</SelectItem>
              )}
              <SelectItem value="global">Global (all units)</SelectItem>
            </SelectContent>
          </Select>
        </FieldGroup>
      )}

      <FieldGroup>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <Input id="name" name="name" required maxLength={200} />
      </FieldGroup>

      <div className="grid grid-cols-2 gap-3">
        <FieldGroup>
          <FieldLabel htmlFor="sku">SKU</FieldLabel>
          <Input id="sku" name="sku" maxLength={50} className="font-mono" />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel htmlFor="uom">UoM</FieldLabel>
          <Select value={uom} onValueChange={(v) => setUom(v as Uom)}>
            <SelectTrigger id="uom">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UOMS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="uom" value={uom} />
        </FieldGroup>
      </div>

      <FieldGroup>
        <FieldLabel htmlFor="notes">Notes</FieldLabel>
        <Input id="notes" name="notes" maxLength={500} />
        <p className="text-xs text-muted-foreground">Optional. Shown in item listings.</p>
      </FieldGroup>

      <FormError message={state?.error} />

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={pending}
          className="transition-ds press"
        >
          {pending ? 'Creating...' : 'Create item'}
        </Button>
      </div>
    </form>
  );
}

function EditForms({
  item,
  allowGlobal,
  defaultUnitId,
  onSuccess,
}: {
  item: MasterRow;
  allowGlobal: boolean;
  defaultUnitId: string | null;
  onSuccess: () => void;
}) {
  const [uom, setUom] = useState<Uom>(item.uom as Uom);
  const [isActive, setIsActive] = useState<'true' | 'false'>(
    item.is_active ? 'true' : 'false',
  );
  const [scope, setScope] = useState<'unit' | 'global'>(
    item.unit_id ? 'unit' : 'global',
  );

  const [updateState, updateAction, updatePending] = useActionState<
    ActionState,
    FormData
  >(updateMasterItemAction, null);

  useActionResult(updateState, {
    onOk: () => {
      toast.success('Item updated');
      onSuccess();
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <form action={updateAction} className="space-y-4">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="uom" value={uom} />
      <input type="hidden" name="is_active" value={isActive} />

      {allowGlobal && (
        <>
          <input type="hidden" name="scope_control" value="1" />
          <input
            type="hidden"
            name="unit_id"
            value={
              scope === 'global'
                ? ''
                : (defaultUnitId ?? item.unit_id ?? '')
            }
          />
          <FieldGroup>
            <FieldLabel>Scope</FieldLabel>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as 'unit' | 'global')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(defaultUnitId || item.unit_id) && (
                  <SelectItem value="unit">This unit only</SelectItem>
                )}
                <SelectItem value="global">Global (all units)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Promote a unit item to all units, or pin a global item to this unit.
            </p>
          </FieldGroup>
        </>
      )}

      <FieldGroup>
        <FieldLabel htmlFor="edit-name">Name</FieldLabel>
        <Input
          id="edit-name"
          name="name"
          defaultValue={item.name}
          required
          maxLength={200}
        />
      </FieldGroup>

      <div className="grid grid-cols-2 gap-3">
        <FieldGroup>
          <FieldLabel htmlFor="edit-sku">SKU</FieldLabel>
          <Input
            id="edit-sku"
            name="sku"
            defaultValue={item.sku ?? ''}
            maxLength={50}
            className="font-mono"
          />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel htmlFor="edit-uom">UoM</FieldLabel>
          <Select value={uom} onValueChange={(v) => setUom(v as Uom)}>
            <SelectTrigger id="edit-uom">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UOMS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldGroup>
      </div>

      <FieldGroup>
        <FieldLabel htmlFor="edit-active">Status</FieldLabel>
        <Select
          value={isActive}
          onValueChange={(v) => setIsActive(v as 'true' | 'false')}
        >
          <SelectTrigger id="edit-active">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FieldGroup>

      <FormError message={updateState?.error} />

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={updatePending}
          className="transition-ds press"
        >
          {updatePending ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
