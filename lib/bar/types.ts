// Client-safe shapes for the bar feature. queries.ts is `server-only`;
// importing a type from it still pulls the module into the client bundle.

export type BarCategory = 'alcohol' | 'cigar' | 'soft_drink' | 'grocery';

export const BAR_CATEGORIES: BarCategory[] = [
  'alcohol',
  'cigar',
  'soft_drink',
  'grocery',
];

export type BarChitStatus = 'pending' | 'finalized' | 'cancelled';

export interface BarChit {
  id: string;
  unit_id: string;
  date: string;
  profile_id?: string | null;
  guest_name?: string | null;
  booking_id?: string | null;
  total_amount: number;
  status: BarChitStatus;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BarChitItem {
  id: string;
  chit_id: string;
  variant_id: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at?: string;
  updated_at?: string;
}

/** Adopted catalog row for bar pickers — identity + committee sale rate, no free-text product field on chits. */
export type BarCatalogItem = {
  variant_id: string;
  name: string;
  sku: string | null;
  local_sku: string | null;
  category: string | null;
  pack_label: string | null;
  volume_ml: number | null;
  menu_rate: number | null;
};

export type BarInventoryLot = {
  id: string | null;
  unit_id: string | null;
  item_id: string | null;
  item_name: string | null;
  qty_packs: number | null;
  rate: number | null;
  pack_label: string | null;
  category: string | null;
  volume_ml: number | null;
  is_active: boolean | null;
  acquired_on?: string | null;
  created_at?: string | null;
  menu_rate: number | null;
};

export type BarChitRow = BarChit & {
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    rank: string | null;
    service_no: string | null;
  } | null;
  booking: { id: string; guest_name: string; room: { name: string } | null } | null;
  items: (BarChitItem & {
    variant: {
      id: string;
      product: { name: string } | null;
      unit_value: number;
      unit_type: string;
      package_type: string;
    } | null;
  })[];
};
