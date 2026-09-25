import type { MessingMealType, MessingBillingMode } from '@/lib/schemas/messing';

export type MealCutStatus = 'requested' | 'approved' | 'rejected';
export type RegisterStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface MessingFlatRate {
  id: string;
  unit_id: string;
  meal_type: MessingMealType;
  rate: number;
  valid_from: string;
  valid_to?: string | null;
  created_at?: string;
  created_by?: string | null;
  updated_at?: string;
  updated_by?: string | null;
}
export type MessingFlatRateRow = MessingFlatRate;

export interface MessDailyExpenditure {
  id: string;
  unit_id: string;
  expenditure_date: string;
  morning_amount: number;
  afternoon_amount: number;
  dinner_amount: number;
  total_amount: number;
  notes?: string | null;
  receipt_ref?: string | null;
  vendor_name?: string | null;
  sourcing_category?: string;
  register_status?: RegisterStatus | string;
  submitted_at?: string | null;
  submitted_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  reject_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}
export type MessDailyExpenditureRow = MessDailyExpenditure;

export interface MessDailyPRate {
  id: string;
  unit_id: string;
  rate_date: string;
  total_expenditure: number;
  present_count: number;
  rate_per_diner: number;
  calculated_at?: string;
  calculated_by?: string | null;
}
export type MessDailyPRateRow = MessDailyPRate;

export interface MessMealCut {
  id: string;
  unit_id: string;
  profile_id: string;
  cut_date: string;
  meal_type: MessingMealType;
  status: MealCutStatus | string;
  reason?: string | null;
  created_at?: string;
  updated_at?: string;
}
export type MessMealCutRow = MessMealCut;

export interface GuestMeal {
  id: string;
  unit_id: string;
  host_profile_id: string;
  meal_date: string;
  meal_type: MessingMealType;
  guest_count: number;
  guest_names?: string | null;
  rate_charged: number;
  total_amount: number;
  notes?: string | null;
  is_billed?: boolean;
  billed_period_id?: string | null;
  created_at?: string;
  created_by?: string | null;
}
export type GuestMealRow = GuestMeal;

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
