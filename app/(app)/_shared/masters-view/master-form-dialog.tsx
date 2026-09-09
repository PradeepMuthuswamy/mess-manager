'use client';

import { useActionState, useState, useTransition } from 'react';
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
  adoptVariantAction,
  setUnitMenuRateAction,
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

export type MasterFormMode = 'create' | 'edit' | 'adopt' | 'menu-rate';

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
  mode: MasterFormMode;
  category: Category;
  slug: CategorySlug;
  item: MasterRow | null;
  allowGlobal: boolean;
  defaultUnitId: string | null;
  onClose: () => void;
  categories?: Array<{ id: string; name: string; parent_id: string | null }>;
}) {
  const titles: Record<MasterFormMode, string> = {
    create: 'Add catalog product',
    edit: 'Edit catalog product',
    adopt: 'Adopt variant',
    'menu-rate': 'Set menu rate',
  };
  const descriptions: Record<MasterFormMode, string | undefined> = {
    create: `Create a global ${slug} product and first variant.`,
    edit: item?.name ?? undefined,
    adopt: item
      ? `Add ${item.name} to this unit. Product name stays on the global catalog.`
      : undefined,
    'menu-rate': item
      ? `Committee sale rate for ${item.name}. Distinct from lot cost.`
      : undefined,
  };

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={titles[mode]}
      description={descriptions[mode]}
    >
      {mode === 'create' && allowGlobal ? (
        <CreateForm
          slug={slug}
          onSuccess={onClose}
          categories={categories}
        />
      ) : null}
      {mode === 'edit' && item && allowGlobal ? (
        <EditForm item={item} onSuccess={onClose} />
      ) : null}
      {mode === 'adopt' && item && defaultUnitId ? (
        <AdoptForm item={item} unitId={defaultUnitId} onSuccess={onClose} />
      ) : null}
      {mode === 'menu-rate' && item && defaultUnitId ? (
        <MenuRateForm
          item={item}
          unitId={defaultUnitId}
          category={category}
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

function packLabel(item: MasterRow): string {
  if (item.pack_label) return item.pack_label;
  const val = item.unit_value;
  const type = item.unit_type;
  const pkg = item.package_type;
  if (val !== undefined && type && pkg) return `${val} ${type} ${pkg}`;
  return item.uom;
}

function CreateForm({
  slug,
  onSuccess,
  categories,
}: {
  slug: CategorySlug;
  onSuccess: () => void;
  categories: Array<{ id: string; name: string; parent_id: string | null }>;
}) {
  const parentId = CATEGORY_ID_MAP[slug];
  const subcategories = categories.filter((c) => c.parent_id === parentId);

  const [categoryId, setCategoryId] = useState<string>(parentId);
  const [unitType, setUnitType] = useState<(typeof UNIT_TYPES)[number]>('PIECE');
  const [packageType, setPackageType] = useState<(typeof PACKAGE_TYPES)[number]>(
    'LOOSE',
  );

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
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          First Variant Details
        </h3>

        <div className="mb-3 grid grid-cols-2 gap-3">
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
            <Select
              value={unitType}
              onValueChange={(v) => setUnitType(v as (typeof UNIT_TYPES)[number])}
            >
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
            <Select
              value={packageType}
              onValueChange={(v) =>
                setPackageType(v as (typeof PACKAGE_TYPES)[number])
              }
            >
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
          {pending ? 'Creating...' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  item,
  onSuccess,
}: {
  item: MasterRow;
  onSuccess: () => void;
}) {
  const [unitType, setUnitType] = useState<(typeof UNIT_TYPES)[number]>(
    (item.unit_type as (typeof UNIT_TYPES)[number] | undefined) || 'PIECE',
  );
  const [packageType, setPackageType] = useState<(typeof PACKAGE_TYPES)[number]>(
    (item.package_type as (typeof PACKAGE_TYPES)[number] | undefined) || 'LOOSE',
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
          defaultValue={item.product_description ?? ''}
          maxLength={500}
          rows={2}
        />
      </FieldGroup>

      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Variant Details
        </h3>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <FieldGroup>
            <FieldLabel htmlFor="edit-unit_value">Unit Value</FieldLabel>
            <Input
              id="edit-unit_value"
              name="unit_value"
              type="number"
              step="any"
              required
              defaultValue={item.unit_value ?? 1}
            />
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="edit-unit_type">Unit Type</FieldLabel>
            <Select
              value={unitType}
              onValueChange={(v) => setUnitType(v as (typeof UNIT_TYPES)[number])}
            >
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
            <Select
              value={packageType}
              onValueChange={(v) =>
                setPackageType(v as (typeof PACKAGE_TYPES)[number])
              }
            >
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

function AdoptForm({
  item,
  unitId,
  onSuccess,
}: {
  item: MasterRow;
  unitId: string;
  onSuccess: () => void;
}) {
  const [localSku, setLocalSku] = useState(item.local_sku ?? '');
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await adoptVariantAction({
        unit_id: unitId,
        variant_id: item.id,
        local_sku: localSku.trim() || null,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Adopted ${item.name}`);
      onSuccess();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {packLabel(item)}
          {item.sku ? ` · ${item.sku}` : ''}
        </p>
      </div>

      <FieldGroup>
        <FieldLabel htmlFor="adopt-local-sku">Local SKU</FieldLabel>
        <Input
          id="adopt-local-sku"
          value={localSku}
          onChange={(e) => setLocalSku(e.currentTarget.value)}
          maxLength={50}
          className="font-mono"
          placeholder="Optional unit SKU"
        />
        <p className="text-xs text-muted-foreground">
          Overrides the catalog SKU for this unit only.
        </p>
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={pending} className="transition-ds press">
          {pending ? 'Adopting...' : 'Adopt variant'}
        </Button>
      </div>
    </form>
  );
}

function MenuRateForm({
  item,
  unitId,
  category,
  onSuccess,
}: {
  item: MasterRow;
  unitId: string;
  category: Category;
  onSuccess: () => void;
}) {
  const existing = item.menu_rate ?? item.current_rate;
  const [rate, setRate] = useState(existing != null ? String(existing) : '');
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Enter a valid menu rate');
      return;
    }
    startTransition(async () => {
      const res = await setUnitMenuRateAction({
        unit_id: unitId,
        variant_id: item.id,
        rate: parsed,
        effective_from: effectiveFrom,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Menu rate saved');
      onSuccess();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {packLabel(item)}
        </p>
      </div>

      <FieldGroup>
        <FieldLabel htmlFor="menu-rate">Menu rate (₹)</FieldLabel>
        <Input
          id="menu-rate"
          type="number"
          step="0.01"
          min="0"
          required
          value={rate}
          onChange={(e) => setRate(e.currentTarget.value)}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          {category === 'ration'
            ? 'Committee rate for this unit. Ration scale qty is separate.'
            : 'Peg or bottle sale rate for this unit — not the inventory lot cost.'}
        </p>
      </FieldGroup>

      <FieldGroup>
        <FieldLabel htmlFor="menu-rate-from">Effective from</FieldLabel>
        <Input
          id="menu-rate-from"
          type="date"
          required
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.currentTarget.value)}
        />
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={pending} className="transition-ds press">
          {pending ? 'Saving...' : 'Save menu rate'}
        </Button>
      </div>
    </form>
  );
}

