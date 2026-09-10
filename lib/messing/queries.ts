import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MessingMealType, MessingBillingMode } from '@/lib/schemas/messing';
import { messingMealTypeEnum, MESSING_MEAL_TYPE_LABEL } from '@/lib/schemas/messing';
import { calculateMemberMessingCycle } from '@/lib/billing/compute';
import { getCurrentBillingPeriod } from '@/lib/billing/queries';
import { eachDayOfInterval, differenceInCalendarDays, parseISO, format } from 'date-fns';
import type {
  MessDailyExpenditureRow,
  MessDailyPRateRow,
  MessMealCutRow,
  GuestMealRow,
  DinerTodayMessingView,
  CycleMtdView,
  RequestedMealCutView,
  MealCutStatus,
  MessingFlatRateRow,
} from './types';

/**
 * Returns all flat rate records (past and current) sorted by valid_from desc, then meal_type asc.
 */
export async function getFlatRatesHistory(unitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messing_flat_rates')
    .select('*')
    .eq('unit_id', unitId)
    .order('valid_from', { ascending: false })
    .order('meal_type', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Returns a key-value mapping of active rates for all meal types on a given date (defaulting to 0 if not found).
 */
export async function getActiveFlatRates(
  unitId: string,
  dateStr: string
): Promise<Record<MessingMealType, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('messing_flat_rates')
    .select('meal_type, rate')
    .eq('unit_id', unitId)
    .lte('valid_from', dateStr)
    .or(`valid_to.is.null,valid_to.gte.${dateStr}`);

  if (error) {
    throw new Error(error.message);
  }

  const mapping = {} as Record<MessingMealType, number>;
  for (const m of messingMealTypeEnum) {
    mapping[m] = 0;
  }

  if (data) {
    for (const row of data) {
      mapping[row.meal_type as MessingMealType] = Number(row.rate);
    }
  }

  return mapping;
}

/**
 * Fetches daily kitchen expenditure entered by the Mess Havildar.
 */
export async function getDailyExpenditure(
  unitId: string,
  dateStr: string
): Promise<MessDailyExpenditureRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_daily_expenditures')
    .select('*')
    .eq('unit_id', unitId)
    .eq('expenditure_date', dateStr)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Fetches daily calculated P-rate snapshot.
 */
export async function getDailyPRate(
  unitId: string,
  dateStr: string
): Promise<MessDailyPRateRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_daily_p_rates')
    .select('*')
    .eq('unit_id', unitId)
    .eq('rate_date', dateStr)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Fetches monthly P-rates between two dates.
 */
export async function getMonthlyPRates(
  unitId: string,
  startDate: string,
  endDate: string
): Promise<MessDailyPRateRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_daily_p_rates')
    .select('*')
    .eq('unit_id', unitId)
    .gte('rate_date', startDate)
    .lte('rate_date', endDate)
    .order('rate_date', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Last N calendar days of stored P-rates (inclusive of today).
 */
export async function getRecentPRates(
  unitId: string,
  days: number
): Promise<MessDailyPRateRow[]> {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (safeDays - 1));

  const pad = (n: number) => String(n).padStart(2, '0');
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return getMonthlyPRates(unitId, toIso(start), toIso(end));
}

/**
 * Fetches meal cuts for a member in a date range.
 */
export async function getMemberMealCuts(
  unitId: string,
  profileId: string,
  startDate: string,
  endDate: string
): Promise<MessMealCutRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_meal_cuts')
    .select('*')
    .eq('unit_id', unitId)
    .eq('profile_id', profileId)
    .gte('cut_date', startDate)
    .lte('cut_date', endDate)
    .order('cut_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Fetches casual guest meals hosted by unit members.
 */
export async function listGuestMeals(
  unitId: string,
  startDate: string,
  endDate: string,
  hostProfileId?: string
): Promise<GuestMealRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('guest_meals')
    .select('*')
    .eq('unit_id', unitId)
    .gte('meal_date', startDate)
    .lte('meal_date', endDate)
    .order('meal_date', { ascending: false });

  if (hostProfileId) {
    query = query.eq('host_profile_id', hostProfileId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Computes today's messing status for an officer:
 * - Billing mode of the unit (FLAT_RATE vs P_REGISTER_SPLIT)
 * - Whether present on day roll
 * - Meals breakdown with cut status and rates
 * - Today's estimated charge
 */
export async function getDinerTodayStatus(
  unitId: string,
  profileId: string,
  dateStr: string
): Promise<DinerTodayMessingView> {
  const supabase = await createClient();

  // 1. Get unit messing billing mode
  const { data: unitData } = await supabase
    .from('units')
    .select('messing_billing_mode')
    .eq('id', unitId)
    .single();

  const billingMode: MessingBillingMode =
    (unitData?.messing_billing_mode as MessingBillingMode) ?? 'P_REGISTER_SPLIT';

  // 2. Check general attendance: see if marked absent
  const { data: dayRow } = await supabase
    .from('attendance_days')
    .select('id')
    .eq('unit_id', unitId)
    .eq('attendance_date', dateStr)
    .maybeSingle();

  let isAttendingDay = true;
  if (dayRow) {
    const { data: absence } = await supabase
      .from('attendance_absences')
      .select('id')
      .eq('day_id', dayRow.id)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (absence) {
      isAttendingDay = false;
    }
  }

  // 3. Fetch meal cuts for today
  const { data: cuts } = await supabase
    .from('mess_meal_cuts')
    .select('*')
    .eq('unit_id', unitId)
    .eq('profile_id', profileId)
    .eq('cut_date', dateStr);

  const cutMap = new Map<MessingMealType, MessMealCutRow>();
  for (const c of cuts ?? []) {
    cutMap.set(c.meal_type as MessingMealType, c);
  }

  // 4. Fetch flat rates
  const rates = await getActiveFlatRates(unitId, dateStr);

  // 5. Fetch P-rate if any
  const pRateRow = await getDailyPRate(unitId, dateStr);
  const todayPRate = pRateRow ? Number(pRateRow.rate_per_diner) : null;

  // Primary military meals shown to diner
  const primaryMeals: MessingMealType[] = ['breakfast', 'lunch', 'dinner'];
  const meals = primaryMeals.map((m) => {
    const cut = cutMap.get(m);
    const cutStatus = (cut?.status as MealCutStatus | undefined) ?? null;
    return {
      mealType: m,
      label: MESSING_MEAL_TYPE_LABEL[m],
      isCut: cutStatus === 'approved',
      isRequested: cutStatus === 'requested',
      cutStatus,
      cutReason: cut?.reason,
      rate: rates[m] ?? 0,
    };
  });

  // Calculate estimated daily charge
  let estimatedDailyCharge = 0;
  if (isAttendingDay) {
    if (billingMode === 'P_REGISTER_SPLIT') {
      estimatedDailyCharge = todayPRate ?? 0;
    } else {
      for (const m of meals) {
        if (!m.isCut) {
          estimatedDailyCharge += m.rate;
        }
      }
    }
  }

  return {
    date: dateStr,
    unitId,
    billingMode,
    isAttendingDay,
    meals,
    todayPRate,
    estimatedDailyCharge,
  };
}

/**
 * Meal-cut requests awaiting Havildar / attendance.write approval.
 */
export async function listRequestedMealCuts(unitId: string): Promise<RequestedMealCutView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_meal_cuts')
    .select('*')
    .eq('unit_id', unitId)
    .eq('status', 'requested')
    .order('cut_date', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.profile_id))];

  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, full_name, rank')
      .in('id', ids);
    if (pErr) throw new Error(pErr.message);
    for (const p of profiles ?? []) {
      const label = [p.rank, p.display_name ?? p.full_name].filter(Boolean).join(' ');
      names.set(p.id, label || 'Unknown');
    }
  }

  return rows.map((r) => ({
    ...r,
    memberName: names.get(r.profile_id) ?? 'Unknown',
  }));
}

function ratesOnDate(
  history: MessingFlatRateRow[],
  dateStr: string,
): Record<MessingMealType, number> {
  const mapping = {} as Record<MessingMealType, number>;
  for (const m of messingMealTypeEnum) {
    mapping[m] = 0;
  }
  const assigned = new Set<MessingMealType>();
  for (const row of history) {
    if (row.valid_from > dateStr) continue;
    if (row.valid_to && row.valid_to < dateStr) continue;
    const meal = row.meal_type as MessingMealType;
    if (assigned.has(meal)) continue;
    assigned.add(meal);
    mapping[meal] = Number(row.rate);
  }
  return mapping;
}

/**
 * Current (or date-containing) billing period plus a cheap cycle MTD estimate
 * for the member, using stored P-rates, approved cuts, and absences.
 */
export async function getMemberCycleMtd(
  unitId: string,
  profileId: string,
  asOfDate: string,
): Promise<CycleMtdView | null> {
  const supabase = await createClient();

  const { data: containing, error: containingErr } = await supabase
    .from('mess_billing_periods')
    .select('*')
    .eq('unit_id', unitId)
    .lte('start_date', asOfDate)
    .gte('end_date', asOfDate)
    .in('status', ['open', 'draft', 'published'])
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (containingErr) throw new Error(containingErr.message);

  const period = containing ?? (await getCurrentBillingPeriod(unitId));
  if (!period) return null;

  const start = period.start_date;
  const end = period.end_date;
  const clampedAsOf = asOfDate < start ? start : asOfDate > end ? end : asOfDate;
  const daysElapsed = Math.max(
    0,
    differenceInCalendarDays(parseISO(clampedAsOf), parseISO(start)) + 1,
  );
  const daysInPeriod = Math.max(
    1,
    differenceInCalendarDays(parseISO(end), parseISO(start)) + 1,
  );

  const base: CycleMtdView = {
    periodName: period.name,
    periodStart: start,
    periodEnd: end,
    periodStatus: period.status,
    daysElapsed,
    daysInPeriod,
    estimatedCycleTotal: null,
  };

  try {
    const { data: unitData } = await supabase
      .from('units')
      .select('messing_billing_mode')
      .eq('id', unitId)
      .single();

    const billingMode: MessingBillingMode =
      (unitData?.messing_billing_mode as MessingBillingMode) ?? 'P_REGISTER_SPLIT';

    const cycleDates = eachDayOfInterval({
      start: parseISO(start),
      end: parseISO(clampedAsOf),
    }).map((d) => format(d, 'yyyy-MM-dd'));

    const [{ data: days }, pRateRows, cuts, flatHistory] = await Promise.all([
      supabase
        .from('attendance_days')
        .select('id, attendance_date')
        .eq('unit_id', unitId)
        .gte('attendance_date', start)
        .lte('attendance_date', clampedAsOf),
      getMonthlyPRates(unitId, start, clampedAsOf),
      getMemberMealCuts(unitId, profileId, start, clampedAsOf),
      getFlatRatesHistory(unitId),
    ]);

    const dayRows = days ?? [];
    const dayById = new Map(dayRows.map((d) => [d.id, d.attendance_date]));
    const absentDates = new Set<string>();

    if (dayRows.length > 0) {
      const { data: absences } = await supabase
        .from('attendance_absences')
        .select('day_id')
        .eq('profile_id', profileId)
        .in(
          'day_id',
          dayRows.map((d) => d.id),
        );
      for (const a of absences ?? []) {
        const date = dayById.get(a.day_id);
        if (date) absentDates.add(date);
      }
    }

    const pRates = new Map<string, number>(
      pRateRows.map((r) => [r.rate_date, Number(r.rate_per_diner)]),
    );
    const approvedCuts = new Set(
      cuts
        .filter((c) => c.status === 'approved')
        .map((c) => `${c.cut_date}:${c.meal_type}`),
    );

    const result = calculateMemberMessingCycle({
      billingMode,
      cycleDates,
      isAbsentOnDate: (d) => absentDates.has(d),
      pRates,
      flatRatesOnDate: (d) => ratesOnDate(flatHistory, d),
      isMealCut: (d, meal) => approvedCuts.has(`${d}:${meal}`),
    });

    return { ...base, estimatedCycleTotal: result.total };
  } catch {
    return base;
  }
}
