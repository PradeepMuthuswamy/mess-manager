import type { Database } from '@/lib/supabase/database.types';
import type { MessingMealType, MessingBillingMode } from '@/lib/schemas/messing';

export type MessDailyExpenditureRow = Database['public']['Tables']['mess_daily_expenditures']['Row'];
export type MessDailyPRateRow = Database['public']['Tables']['mess_daily_p_rates']['Row'];
export type MessMealCutRow = Database['public']['Tables']['mess_meal_cuts']['Row'];
export type GuestMealRow = Database['public']['Tables']['guest_meals']['Row'];
export type MessingFlatRateRow = Database['public']['Tables']['messing_flat_rates']['Row'];

export type MealCutStatus = 'requested' | 'approved' | 'rejected';
export type RegisterStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface DinerDailyMealStatus {
  mealType: MessingMealType;
  label: string;
  isCut: boolean;
  isRequested: boolean;
  cutStatus: MealCutStatus | null;
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

export interface CycleMtdView {
  periodName: string;
  periodStart: string;
  periodEnd: string;
  periodStatus: string;
  daysElapsed: number;
  daysInPeriod: number;
  estimatedCycleTotal: number | null;
}

export type RequestedMealCutView = MessMealCutRow & {
  memberName: string;
};

export type PendingRegisterView = Pick<
  MessDailyExpenditureRow,
  | 'id'
  | 'unit_id'
  | 'expenditure_date'
  | 'total_amount'
  | 'morning_amount'
  | 'afternoon_amount'
  | 'dinner_amount'
  | 'vendor_name'
  | 'register_status'
>;
