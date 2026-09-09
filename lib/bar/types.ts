// Client-safe shapes for the bar feature. queries.ts is `server-only`;
// importing a type from it still pulls the module into the client bundle.

import type { Database } from '@/lib/supabase/database.types';

export type BarCategory = Extract<
  Database['public']['Enums']['item_category'],
  'alcohol' | 'cigar' | 'soft_drink' | 'grocery'
>;

export const BAR_CATEGORIES: BarCategory[] = [
  'alcohol',
  'cigar',
  'soft_drink',
  'grocery',
];

/** Adopted catalog row for bar pickers — identity + committee sale rate, no free-text product field on chits. */
export type BarCatalogItem = {
  variant_id: string;
  name: string;
  sku: string | null;
  local_sku: string | null;
  category: Database['public']['Enums']['item_category'] | null;
  pack_label: string | null;
  volume_ml: number | null;
  menu_rate: number | null;
};

export type BarInventoryLot =
  Database['public']['Views']['v_unit_inventory_current']['Row'] & {
    menu_rate: number | null;
  };

export type BarChitRow = Database['public']['Tables']['bar_chits']['Row'] & {
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    rank: string | null;
    service_no: string | null;
  } | null;
  booking: { id: string; guest_name: string; room: { name: string } | null } | null;
  items: (Database['public']['Tables']['bar_chit_items']['Row'] & {
    variant: {
      id: string;
      product: { name: string } | null;
      unit_value: number;
      unit_type: string;
      package_type: string;
    } | null;
  })[];
};
