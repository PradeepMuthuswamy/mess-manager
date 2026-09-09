import type { Database } from '@/lib/supabase/database.types';
import type { MessingMealType, MessingBillingMode } from '@/lib/schemas/messing';

export type MessDailyExpenditureRow = Database['public']['Tables']['mess_daily_expenditures']['Row'];
export type MessDailyPRateRow = Database['public']['Tables']['mess_daily_p_rates']['Row'];
export type MessMealCutRow = Database['public']['Tables']['mess_meal_cuts']['Row'];
export type GuestMealRow = Database['public']['Tables']['guest_meals']['Row'];
export type MessingFlatRateRow = Database['public']['Tables']['messing_flat_rates']['Row'];

export interface DinerDailyMealStatus {
  mealType: MessingMealType;
  label: string;
  isCut: boolean;
  cutReason?: string | null;
  rate: number;
}

export interface DinerTodayMessingView {
  date: string;
  unitId: string;
  billingMode: MessingBillingMode;
  isAttendingDay: boolean;
  meals: DinerDailyMealStatus[];
  todayPRate?: number | null;
  estimatedDailyCharge: number;
}
