import type { Category } from './categories';
import type { RationClass, RationTerrain } from '@/lib/schemas/ration';

// One row in the masters table can be authorised across many (rank × terrain)
// ration scales. Used by the "Authorisations" column on the ration masters
// page so admins can see at a glance who gets how much of an item.
export type AuthorisationChip = {
  scale_id: string;
  scale_name: string;
  rank_class: RationClass;
  terrain: RationTerrain;
  auth_qty: number;
  uom: string;
};

export type MasterRow = {
  id: string;
  unit_id: string | null;
  category: Category;
  name: string;
  sku: string | null;
  uom: string;
  is_active: boolean;
  current_rate: number | null;
  current_ration_scale: number | null;
  rate_valid_from: string | null;
  version_id: string | null;
  updated_at: string;
  pack_size_id: string | null;
  pack_label: string | null;
  pack_kind: 'volume' | 'count' | null;
  volume_ml: number | null;
  unit_count: number | null;
  // Variant-specific fields for UI
  product_id?: string;
  product_name?: string;
  product_description?: string | null;
  category_name?: string;
  subcategory_name?: string | null;
  unit_value?: number;
  unit_type?: string;
  package_type?: string;
};

export type VersionRow = {
  id: string;
  rate: number;
  ration_scale: number | null;
  notes: string | null;
  valid_from: string;
  valid_to: string | null;
  created_by: string | null;
};

export type ListMastersOpts = {
  q?: string;
  activeUnitId: string | null;
  isAllUnits: boolean;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};
