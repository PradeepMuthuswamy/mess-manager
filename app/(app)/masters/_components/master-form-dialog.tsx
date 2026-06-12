'use client';

import { useActionState, useState } from 'react';
import { useActionResult } from '@/hooks/use-action-result';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import type { Category, CategorySlug } from '@/lib/masters/categories';

type ActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
} | null;

const CATEGORY_ID_MAP: Record<CategorySlug, string> = {
  alcohol: '00000000-0000-0000-0000-000000000001',
  'cold-drinks': '00000000-0000-0000-0000-000000000002',
  cigars: '00000000-0000-0000-0000-000000000003',
  snacks: '00000000-0000-0000-0000-000000000004',
  ration: '00000000-0000-0000-0000-000000000005',
  grocery: '00000000-0000-0000-0000-000000000006',
};

const UNIT_TYPES = ['ML', 'LITRE', 'GRAM', 'KG', 'PIECE'] as const;
const PACKAGE_TYPES = ['BOTTLE', 'CAN', 'PACKET', 'BOX', 'LOOSE'] as const;

export function MasterFormDialog({
  open,
  mode,
  category,
  slug,
  item,
  allowGlobal,
  defaultUnitId,
  onClose,
  categories = [],
}: {
  open: boolean;
  mode: 'create' | 'edit';
  category: Category;
  slug: CategorySlug;
  item: MasterRow | null;
  allowGlobal: boolean;
  defaultUnitId: string | null;
  onClose: () => void;
  categories?: Array<{ id: string; name: string; parent_id: string | null }>;
}) {
  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Add new item' : 'Edit item'}
      description={
        mode === 'create'
          ? `Create a new ${slug} product and first variant.`
          : (item?.name ?? undefined)
      }
    >
      {mode === 'create' ? (
        <CreateForm
          slug={slug}
          allowGlobal={allowGlobal}
          defaultUnitId={defaultUnitId}
          onSuccess={onClose}
          categories={categories}
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
    <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {children}
    </Label>
  );
}

function CreateForm({
  slug,
  allowGlobal,
  defaultUnitId,
  onSuccess,
  categories,
}: {
  slug: CategorySlug;
  allowGlobal: boolean;
  defaultUnitId: string | null;
  onSuccess: () => void;
  categories: Array<{ id: string; name: string; parent_id: string | null }>;
}) {
  const parentId = CATEGORY_ID_MAP[slug];
  const subcategories = categories.filter((c) => c.parent_id === parentId);

  const [scope, setScope] = useState<'unit' | 'global'>(
    defaultUnitId ? 'unit' : 'global',
  );
  const [categoryId, setCategoryId] = useState<string>(parentId);
  const [unitType, setUnitType] = useState<typeof UNIT_TYPES[number]>('PIECE');
  const [packageType, setPackageType] = useState<typeof PACKAGE_TYPES[number]>('LOOSE');

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createMasterItemAction,
    null,
  );

  useActionResult(state, {
    onOk: () => {
      toast.success('Product and variant created');
      onSuccess();
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="unit_type" value={unitType} />
      <input type="hidden" name="package_type" value={packageType} />
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

      {subcategories.length > 0 && (
        <FieldGroup>
          <FieldLabel htmlFor="subcat_select">Subcategory</FieldLabel>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="subcat_select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={parentId}>None (Parent Category)</SelectItem>
              {subcategories.map((sub) => (
                <SelectItem key={sub.id} value={sub.id}>
                  {sub.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldGroup>
      )}

      <FieldGroup>
        <FieldLabel htmlFor="name">Product Name</FieldLabel>
        <Input id="name" name="name" required maxLength={200} />
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea id="description" name="description" maxLength={500} rows={2} />
      </FieldGroup>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">First Variant Details</h3>
        
        <div className="grid grid-cols-2 gap-3 mb-3">
          <FieldGroup>
            <FieldLabel htmlFor="unit_value">Unit Value</FieldLabel>
            <Input
              id="unit_value"
              name="unit_value"
              type="number"
              step="any"
              required
              defaultValue="1"
            />
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="unit_type">Unit Type</FieldLabel>
            <Select value={unitType} onValueChange={(v) => setUnitType(v as any)}>
              <SelectTrigger id="unit_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup>
            <FieldLabel htmlFor="package_type">Package Type</FieldLabel>
            <Select value={packageType} onValueChange={(v) => setPackageType(v as any)}>
              <SelectTrigger id="package_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACKAGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="sku">SKU</FieldLabel>
            <Input id="sku" name="sku" maxLength={50} className="font-mono" />
          </FieldGroup>
        </div>
      </div>

      <FormError message={state?.error} />

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={pending} className="transition-ds press">
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
  const [scope, setScope] = useState<'unit' | 'global'>(
    item.unit_id ? 'unit' : 'global',
  );
  const [unitType, setUnitType] = useState<typeof UNIT_TYPES[number]>(
    (item as any).unit_type || 'PIECE',
  );
  const [packageType, setPackageType] = useState<typeof PACKAGE_TYPES[number]>(
    (item as any).package_type || 'LOOSE',
  );
  const [isActive, setIsActive] = useState<'true' | 'false'>(
    item.is_active ? 'true' : 'false',
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
      <input type="hidden" name="unit_type" value={unitType} />
      <input type="hidden" name="package_type" value={packageType} />
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
          </FieldGroup>
        </>
      )}

      <FieldGroup>
        <FieldLabel htmlFor="edit-name">Product Name</FieldLabel>
        <Input
          id="edit-name"
          name="name"
          defaultValue={item.name}
          required
          maxLength={200}
        />
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="edit-description">Description</FieldLabel>
        <Textarea
          id="edit-description"
          name="description"
          defaultValue={(item as any).product_description ?? (item as any).notes ?? (item as any).version_notes ?? ''}
          maxLength={500}
          rows={2}
        />
      </FieldGroup>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Variant Details</h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <FieldGroup>
            <FieldLabel htmlFor="edit-unit_value">Unit Value</FieldLabel>
            <Input
              id="edit-unit_value"
              name="unit_value"
              type="number"
              step="any"
              required
              defaultValue={(item as any).unit_value ?? 1}
            />
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="edit-unit_type">Unit Type</FieldLabel>
            <Select value={unitType} onValueChange={(v) => setUnitType(v as any)}>
              <SelectTrigger id="edit-unit_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldGroup>
            <FieldLabel htmlFor="edit-package_type">Package Type</FieldLabel>
            <Select value={packageType} onValueChange={(v) => setPackageType(v as any)}>
              <SelectTrigger id="edit-package_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACKAGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>

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
        </div>
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
        <Button type="submit" disabled={updatePending} className="transition-ds press">
          {updatePending ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
