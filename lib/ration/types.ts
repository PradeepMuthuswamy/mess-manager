// Shared types for the ration module.
// NOT marked `server-only` so client components can `import type` from here.

import type { Database } from '@/lib/supabase/database.types';

export type RationScaleRow            = Database['public']['Tables']['ration_scales']['Row'];
export type RationScaleItemVersionRow = Database['public']['Tables']['ration_scale_item_versions']['Row'];
export type RationScaleItemCurrentRow = Database['public']['Views']['v_ration_scale_items_current']['Row'];

export type RationScaleListItem = RationScaleRow & {
  item_count: number;
};

// Matrix view: one row per item, with auth_qty per scale keyed by scale_id.
export type AuthorisationMatrixRow = {
  item_id: string;
  item_name: string;
  category: string;
  byScale: Record<string, { auth_qty: number; uom: string; notes: string | null }>;
};

export type RationClass = Database['public']['Enums']['ration_class'];
export type RationTerrain = Database['public']['Enums']['ration_terrain'];

export type EligibleItem = {
  id: string;
  name: string;
  category: string;
  uom: string;
};
