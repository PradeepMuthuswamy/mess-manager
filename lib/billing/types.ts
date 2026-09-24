export interface MessBillingPeriod {
  id: string;
  unit_id: string;
  name: string;
  start_date: string;
  end_date: string;
  billing_year: number;
  billing_month: number;
  status: 'open' | 'calculating' | 'draft' | 'published' | 'closed';
  published_at?: string | null;
  published_by?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MessBill {
  id: string;
  unit_id: string;
  billing_period_id: string;
  profile_id: string;
  bill_number: string;
  messing_amount: number;
  bar_amount: number;
  room_amount: number;
  guest_meal_amount: number;
  subscriptions_amount: number;
  misc_amount: number;
  party_amount?: number;
  arrears_amount: number;
  total_amount: number;
  status: 'draft' | 'published' | 'paid' | 'overdue' | 'cancelled';
  due_date: string;
  paid_amount?: number;
  paid_at?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MessBillLineItem {
  id: string;
  bill_id: string;
  category: 'messing' | 'bar' | 'room' | 'guest_meal' | 'subscription' | 'misc' | 'party' | 'arrear';
  item_date: string | null;
  description: string;
  quantity: number;
  unit_rate: number;
  amount: number;
  reference_id?: string | null;
  created_at?: string;
}

export interface MessSubscription {
  id: string;
  unit_id: string;
  name: string;
  description?: string | null;
  amount: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MessMiscDebit {
  id: string;
  unit_id: string;
  profile_id: string;
  charge_date: string;
  category: 'personal_recovery' | 'damage_breakage' | 'laundry_tailor' | 'sports_club' | 'other';
  description: string;
  amount: number;
  receipt_ref?: string | null;
  is_billed: boolean;
  billed_period_id?: string | null;
  created_at?: string;
  created_by?: string | null;
}

export type MessBillingPeriodRow = MessBillingPeriod;
export type MessBillRow = MessBill;
export type MessBillLineItemRow = MessBillLineItem;
export type MessSubscriptionRow = MessSubscription;
export type MessMiscDebitRow = MessMiscDebit;

export interface MessBillWithDetails extends MessBill {
  period?: MessBillingPeriod | null;
  profile?: {
    id: string;
    full_name: string | null;
    service_no: string | null;
    rank: string | null;
  } | null;
  line_items?: MessBillLineItem[];
}
