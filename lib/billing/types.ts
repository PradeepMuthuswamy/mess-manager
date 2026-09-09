import type { Database } from '@/lib/supabase/database.types';

export type MessBillingPeriodRow = Database['public']['Tables']['mess_billing_periods']['Row'];
export type MessBillRow = Database['public']['Tables']['mess_bills']['Row'];
export type MessBillLineItemRow = Database['public']['Tables']['mess_bill_line_items']['Row'];
export type MessSubscriptionRow = Database['public']['Tables']['mess_subscriptions']['Row'];
export type MessMiscDebitRow = Database['public']['Tables']['mess_misc_debits']['Row'];

export interface MessBillWithDetails extends MessBillRow {
  period?: MessBillingPeriodRow | null;
  profile?: {
    id: string;
    full_name: string | null;
    service_no: string | null;
    rank: string | null;
  } | null;
  line_items?: MessBillLineItemRow[];
}
