import 'server-only';

import { getDb } from '@/lib/mongo';
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

function cleanDoc<T>(doc: Record<string, unknown> | null | undefined): T {
  if (!doc) return doc as unknown as T;
  const { _id, ...rest } = doc;
  return rest as unknown as T;
}

/**
 * Returns all flat rate records (past and current) sorted by valid_from desc, then meal_type asc.
 */
export async function getFlatRatesHistory(unitId: string): Promise<MessingFlatRateRow[]> {
  const db = await getDb();
  const docs = await db
    .collection('messing_flat_rates')
    .find({ unit_id: unitId })
    .sort({ valid_from: -1, meal_type: 1 })
    .toArray();

  return docs.map((d) => cleanDoc<MessingFlatRateRow>(d));
}

/**
 * Returns a key-value mapping of active rates for all meal types on a given date (defaulting to 0 if not found).
 */
export async function getActiveFlatRates(
  unitId: string,
  dateStr: string
): Promise<Record<MessingMealType, number>> {
  const db = await getDb();
  const docs = await db
    .collection('messing_flat_rates')
    .find({
      unit_id: unitId,
      valid_from: { $lte: dateStr },
      $or: [{ valid_to: null }, { valid_to: { $gte: dateStr } }],
    })
    .toArray();

  const mapping = {} as Record<MessingMealType, number>;
  for (const m of messingMealTypeEnum) {
    mapping[m] = 0;
  }

  for (const row of docs) {
    mapping[row.meal_type as MessingMealType] = Number(row.rate);
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
  const db = await getDb();
  const doc = await db.collection('mess_daily_expenditures').findOne({
    unit_id: unitId,
    expenditure_date: dateStr,
  });

  return cleanDoc<MessDailyExpenditureRow | null>(doc);
}

/**
 * Fetches daily calculated P-rate snapshot.
 */
export async function getDailyPRate(
  unitId: string,
  dateStr: string
): Promise<MessDailyPRateRow | null> {
  const db = await getDb();
  const doc = await db.collection('mess_daily_p_rates').findOne({
    unit_id: unitId,
    rate_date: dateStr,
  });

  return cleanDoc<MessDailyPRateRow | null>(doc);
}

/**
 * Fetches monthly P-rates between two dates.
 */
export async function getMonthlyPRates(
  unitId: string,
  startDate: string,
  endDate: string
): Promise<MessDailyPRateRow[]> {
  const db = await getDb();
  const docs = await db
    .collection('mess_daily_p_rates')
    .find({
      unit_id: unitId,
      rate_date: { $gte: startDate, $lte: endDate },
    })
    .sort({ rate_date: 1 })
    .toArray();

  return docs.map((d) => cleanDoc<MessDailyPRateRow>(d));
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
  const db = await getDb();
  const docs = await db
    .collection('mess_meal_cuts')
    .find({
      unit_id: unitId,
      profile_id: profileId,
      cut_date: { $gte: startDate, $lte: endDate },
    })
    .sort({ cut_date: -1 })
    .toArray();

  return docs.map((d) => cleanDoc<MessMealCutRow>(d));
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
  const db = await getDb();
  const query: Record<string, unknown> = {
    unit_id: unitId,
    meal_date: { $gte: startDate, $lte: endDate },
  };

  if (hostProfileId) {
    query.host_profile_id = hostProfileId;
  }

  const docs = await db
    .collection('guest_meals')
    .find(query)
    .sort({ meal_date: -1 })
    .toArray();

  return docs.map((d) => cleanDoc<GuestMealRow>(d));
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
  const db = await getDb();

  // 1. Get unit messing billing mode
  const unitData = await db.collection('units').findOne({ id: unitId });
  const billingMode: MessingBillingMode =
    (unitData?.messing_billing_mode as MessingBillingMode) ?? 'P_REGISTER_SPLIT';

  // 2. Check general attendance: see if marked absent
  const dayRow = await db.collection('attendance_days').findOne({
    unit_id: unitId,
    attendance_date: dateStr,
  });

  let isAttendingDay = true;
  if (dayRow) {
    const absence = await db.collection('attendance_absences').findOne({
      day_id: dayRow.id,
      profile_id: profileId,
    });

    if (absence) {
      isAttendingDay = false;
    }
  }

  // 3. Fetch meal cuts for today
  const cuts = await db
    .collection('mess_meal_cuts')
    .find({
      unit_id: unitId,
      profile_id: profileId,
      cut_date: dateStr,
    })
    .toArray();

  const cutMap = new Map<MessingMealType, MessMealCutRow>();
  for (const c of cuts) {
    cutMap.set(c.meal_type as MessingMealType, cleanDoc<MessMealCutRow>(c));
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
  const db = await getDb();
  const docs = await db
    .collection('mess_meal_cuts')
    .find({
      unit_id: unitId,
      status: 'requested',
    })
    .sort({ cut_date: -1 })
    .toArray();

  const rows = docs.map((d) => cleanDoc<MessMealCutRow>(d));
  const ids = [...new Set(rows.map((r) => r.profile_id))];

  const names = new Map<string, string>();
  if (ids.length > 0) {
    const profiles = await db
      .collection('profiles')
      .find({ id: { $in: ids } })
      .toArray();

    for (const p of profiles) {
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
  const db = await getDb();

  const containing = await db
    .collection('mess_billing_periods')
    .find({
      unit_id: unitId,
      start_date: { $lte: asOfDate },
      end_date: { $gte: asOfDate },
      status: { $in: ['open', 'draft', 'published'] },
    })
    .sort({ start_date: -1 })
    .limit(1)
    .toArray();

  const period = containing[0] ?? (await getCurrentBillingPeriod(unitId));
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
    const unitData = await db.collection('units').findOne({ id: unitId });

    const billingMode: MessingBillingMode =
      (unitData?.messing_billing_mode as MessingBillingMode) ?? 'P_REGISTER_SPLIT';

    const cycleDates = eachDayOfInterval({
      start: parseISO(start),
      end: parseISO(clampedAsOf),
    }).map((d) => format(d, 'yyyy-MM-dd'));

    const [days, pRateRows, cuts, flatHistory] = await Promise.all([
      db
        .collection('attendance_days')
        .find({
          unit_id: unitId,
          attendance_date: { $gte: start, $lte: clampedAsOf },
        })
        .toArray(),
      getMonthlyPRates(unitId, start, clampedAsOf),
      getMemberMealCuts(unitId, profileId, start, clampedAsOf),
      getFlatRatesHistory(unitId),
    ]);

    const dayRows = days ?? [];
    const dayById = new Map(dayRows.map((d) => [d.id, d.attendance_date]));
    const absentDates = new Set<string>();

    if (dayRows.length > 0) {
      const absences = await db
        .collection('attendance_absences')
        .find({
          profile_id: profileId,
          day_id: { $in: dayRows.map((d) => d.id) },
        })
        .toArray();

      for (const a of absences) {
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
