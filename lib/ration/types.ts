// Shared types for the ration module.
// NOT marked `server-only` so client components can `import type` from here.

import type { RationClass, RationTerrain } from '@/lib/schemas/ration';
import type { RationStockSource, RationStockTxType } from '@/lib/schemas/ration';

export type { RationClass, RationTerrain, RationStockSource, RationStockTxType };

export interface RationScale {
  id: string;
  unit_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  rank_class: RationClass;
  terrain: RationTerrain;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface RationScaleItemVersion {
  id: string;
  scale_id: string;
  variant_id: string;
  auth_qty: number;
  uom: string;
  notes: string | null;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface RationConsumption {
  id: string;
  unit_id: string;
  consumption_date: string;
  variant_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface RationStockTransaction {
  id: string;
  unit_id: string;
  variant_id: string;
  transaction_date: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export type RationScaleRow = RationScale;
export type RationScaleItemVersionRow = RationScaleItemVersion;
export type RationConsumptionRow = RationConsumption;
export type RationStockTransactionRow = RationStockTransaction;

export type RationScaleItemCurrentRow = {
  version_id: string;
  scale_id: string;
  variant_id?: string;
  item_id?: string;
  unit_id: string | null;
  scale_name: string;
  rank_class: RationClass;
  terrain: RationTerrain;
  scale_active: boolean;
  category: string;
  item_name: string;
  sku: string | null;
  auth_qty: number;
  uom: string;
  notes: string | null;
  valid_from: string;
  created_by: string | null;
};

export type RationScaleListItem = RationScale & {
  item_count: number;
};

// Matrix view: one row per item, with auth_qty per scale keyed by scale_id.
export type AuthorisationMatrixRow = {
  item_id: string;
  item_name: string;
  category: string;
  byScale: Record<string, { auth_qty: number; uom: string; notes: string | null }>;
};

export type EligibleItem = {
  id: string;
  name: string;
  category: string;
  uom: string;
};

export type ListScalesOpts = {
  unitId: string;
  q?: string;
  includeInactive?: boolean;
  rankClass?: RationClass;
  terrain?: RationTerrain;
};

export type DailyRationConsumptionItem = {
  variant_id: string;
  item_name: string;
  category: string;
  uom: string;
  auth_qty: number;
  present_count: number;
  computed_qty: number;
  saved_qty: number | null;
  is_posted: boolean;
  consumption_id: string | null;
};

export type DailyRationConsumptionResult = {
  attendanceStatus: 'draft' | 'finalized' | 'none';
  presentCount: number;
  items: DailyRationConsumptionItem[];
};

/** Per-variant stock summary. Aggregates are split by ledger `type` — never mixed. */
export type RationStockReportRow = {
  variant_id: string;
  item_name: string;
  uom: string;
  /** Sum of `receipt` quantities only. */
  total_receipts: number;
  /** Sum of `consumption` quantities only. */
  total_issued: number;
  /** Sum of `return_to_source` quantities only. */
  total_returned: number;
  /** Signed sum of `adjustment` quantities. */
  total_adjustments: number;
  /** `total_issued - total_returned` (net outflow). */
  net_issued: number;
  /** `receipts + adjustments − issued − returned` (actual on-hand, not floored). */
  net_qty: number;
  /** Same as `net_qty`. */
  current_balance: number;
  /** Rate from the most recent `receipt` (purchase), not from other tx types. */
  last_rate: number;
};

export type RationStockTransactionListItem = {
  id: string;
  variant_id: string;
  transaction_date: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
  source: string | null;
  notes: string | null;
  item_name: string;
};

/** REQ-RAT-09 monthly net: opening + receipts − consumption ± adjustments − returns = closing. */
export type RationMonthlyNetReportRow = {
  variant_id: string;
  item_name: string;
  uom: string;
  opening_qty: number;
  total_receipts: number;
  total_issued: number;
  total_returned: number;
  total_adjustments: number;
  net_qty: number;
  closing_qty: number;
};
