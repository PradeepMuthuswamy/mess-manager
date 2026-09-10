'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import {
  createBillingPeriodSchema,
  runBillingSchema,
  publishBillsSchema,
  markBillPaidSchema,
  createSubscriptionSchema,
  createMiscDebitSchema,
} from '@/lib/schemas/billing';
import type { MessingMealType, MessingBillingMode } from '@/lib/schemas/messing';
import { getActiveFlatRates } from '@/lib/messing/queries';
import {
  getBillableBarChitsForPeriod,
  getBillableGuestMealsForPeriod,
  getBillableMiscDebitsForPeriod,
  getBillablePartyChargesForPeriod,
  getHostChargeRoomBillsForPeriod,
  getMessBillDetails,
  getPriorArrearSourceBills,
  getRegisterStatusByDate,
} from './queries';
import {
  calculateCycleDates,
  calculateMemberMessingCycle,
  deriveStandardBillingCycle,
  filterApprovedPRates,
  groupHostChargeRoomBills,
  groupMemberArrears,
  groupMemberBarChits,
  isChargeBillableForPeriod,
  totalMessBillAmount,
} from './compute';
import { notifyBillsPublished } from './notify';
import type { Database } from '@/lib/supabase/database.types';

type MessBillInsert = Database['public']['Tables']['mess_bills']['Insert'];
type MessBillLineInsert = Database['public']['Tables']['mess_bill_line_items']['Insert'];
type BillingMark = { is_billed: boolean; billed_period_id: string | null };

const EMPTY_FLAT_RATES: Record<MessingMealType, number> = {
  breakfast: 0,
  lunch: 0,
  dinner: 0,
  morning_tea: 0,
  evening_tea: 0,
  packed_breakfast: 0,
  packed_lunch: 0,
  packed_dinner: 0,
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

async function resetChargesForPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  periodId: string
): Promise<string | null> {
  const tables = [
    'guest_meals',
    'mess_misc_debits',
    'mess_party_charges',
    'room_bills',
  ] as const;
  const reset: BillingMark = { is_billed: false, billed_period_id: null };

  for (const table of tables) {
    const { error } = await (
      supabase.from(table) as unknown as {
        update: (values: BillingMark) => {
          eq: (
            column: 'billed_period_id',
            value: string
          ) => PromiseLike<{ error: { message: string } | null }>;
        };
      }
    )
      .update(reset)
      .eq('billed_period_id', periodId);
    if (error) {
      return `Failed to unmark ${table} for re-run: ${error.message}`;
    }
  }
  return null;
}

async function markChargesBilled(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'guest_meals' | 'mess_misc_debits' | 'mess_party_charges' | 'room_bills',
  ids: string[],
  periodId: string
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await (
    supabase.from(table) as unknown as {
      update: (values: BillingMark) => {
        in: (column: 'id', values: string[]) => PromiseLike<{ error: { message: string } | null }>;
      };
    }
  )
    .update({ is_billed: true, billed_period_id: periodId })
    .in('id', ids);
  if (error) {
    console.error(`Failed to mark ${table} billed:`, error.message);
  }
}

type ActionResult = { ok: true; data?: unknown } | { error: string; details?: unknown };

/**
 * Creates a new billing period (e.g. 26th April to 25th May 2026).
 */
export async function createBillingPeriodAction(input: unknown): Promise<ActionResult> {
  const parsed = createBillingPeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid billing period input', details: parsed.error.flatten() };
  }

  const { unit_id, name, start_date, end_date, billing_year, billing_month } = parsed.data;
  await requireCapability('billing.draft', unit_id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_billing_periods')
    .insert({
      unit_id,
      name,
      start_date,
      end_date,
      billing_year,
      billing_month,
      status: 'open',
    })
    .select()
    .single();

  if (error) {
    return { error: `Failed to create billing period: ${error.message}` };
  }

  revalidatePath('/billing');
  return { ok: true, data };
}

/**
 * Core Monthly Billing Engine:
 * Compiles all operational components (Messing, Bar, Rooms, Guest Meals, Subscriptions, Misc)
 * across the 26th-to-25th billing cycle into individual member mess bills.
 */
export async function runMonthlyBillingAction(input: unknown): Promise<ActionResult> {
  const parsed = runBillingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const { unit_id, billing_period_id } = parsed.data;
  await requireCapability('billing.draft', unit_id);
  const supabase = await createClient();

  const { data: period, error: periodErr } = await supabase
    .from('mess_billing_periods')
    .select('*')
    .eq('id', billing_period_id)
    .single();

  if (periodErr || !period) {
    return { error: 'Billing period not found' };
  }

  if (period.status === 'published' || period.status === 'closed') {
    return { error: 'Cannot recalculate a published or closed billing period' };
  }

  const unmarkError = await resetChargesForPeriod(supabase, billing_period_id);
  if (unmarkError) {
    return { error: unmarkError };
  }

  const { start_date, end_date, billing_year, billing_month } = period;
  const { dueDate } = deriveStandardBillingCycle(billing_year, billing_month);
  const cycleDates = calculateCycleDates(start_date, end_date);

  const { data: unitData } = await supabase
    .from('units')
    .select('messing_billing_mode')
    .eq('id', unit_id)
    .single();

  const billingMode: MessingBillingMode =
    (unitData?.messing_billing_mode as MessingBillingMode) ?? 'P_REGISTER_SPLIT';

  const { data: members, error: memErr } = await supabase
    .from('profiles')
    .select('id, full_name, service_no, rank, dining_in')
    .eq('unit_id', unit_id);

  if (memErr || !members || members.length === 0) {
    return { error: 'No members found in this unit to bill.' };
  }

  const { data: pRates } = await supabase
    .from('mess_daily_p_rates')
    .select('*')
    .eq('unit_id', unit_id)
    .gte('rate_date', start_date)
    .lte('rate_date', end_date);

  const pRateMap = new Map<string, number>();
  for (const r of pRates ?? []) {
    pRateMap.set(r.rate_date, Number(r.rate_per_diner));
  }

  let registerStatusByDate: Map<string, string | null>;
  try {
    registerStatusByDate = await getRegisterStatusByDate(unit_id, start_date, end_date);
  } catch (err) {
    return {
      error: `Failed to load kitchen register: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const approvedPRates = filterApprovedPRates(pRateMap, registerStatusByDate);

  const { data: attendanceDays } = await supabase
    .from('attendance_days')
    .select('id, attendance_date')
    .eq('unit_id', unit_id)
    .gte('attendance_date', start_date)
    .lte('attendance_date', end_date);

  const attendanceByDate = new Map<string, { id: string; attendance_date: string }>();
  for (const d of attendanceDays ?? []) {
    attendanceByDate.set(d.attendance_date, d);
  }

  const dayIds = (attendanceDays ?? []).map((d) => d.id);
  const { data: absences } =
    dayIds.length > 0
      ? await supabase.from('attendance_absences').select('day_id, profile_id').in('day_id', dayIds)
      : { data: [] as Array<{ day_id: string; profile_id: string | null }> };

  const absenteeSet = new Set<string>();
  for (const a of absences ?? []) {
    if (a.profile_id) {
      absenteeSet.add(`${a.day_id}:${a.profile_id}`);
    }
  }

  const { data: mealCuts } = await supabase
    .from('mess_meal_cuts')
    .select('*')
    .eq('unit_id', unit_id)
    .gte('cut_date', start_date)
    .lte('cut_date', end_date)
    .eq('status', 'approved');

  const cutSet = new Set<string>();
  for (const c of mealCuts ?? []) {
    cutSet.add(`${c.profile_id}:${c.cut_date}:${c.meal_type}`);
  }

  let barChits;
  try {
    barChits = await getBillableBarChitsForPeriod(unit_id, start_date, end_date);
  } catch (err) {
    return { error: `Failed to load bar chits: ${err instanceof Error ? err.message : String(err)}` };
  }
  const memberBarChits = groupMemberBarChits(barChits);

  let roomBills;
  try {
    roomBills = await getHostChargeRoomBillsForPeriod(unit_id, start_date, end_date);
  } catch (err) {
    return { error: `Failed to load room bills: ${err instanceof Error ? err.message : String(err)}` };
  }
  const memberRoomBills = groupHostChargeRoomBills(roomBills, start_date, end_date);
  const roomBillFlags = new Map(
    roomBills.map((bill) => [
      bill.id,
      { is_billed: bill.is_billed, billed_period_id: bill.billed_period_id },
    ])
  );

  let guestMeals;
  let miscDebits;
  let partyCharges;
  let arrearSources;
  try {
    [guestMeals, miscDebits, partyCharges, arrearSources] = await Promise.all([
      getBillableGuestMealsForPeriod(unit_id, billing_period_id, start_date, end_date),
      getBillableMiscDebitsForPeriod(unit_id, billing_period_id, end_date),
      getBillablePartyChargesForPeriod(unit_id, billing_period_id, end_date),
      getPriorArrearSourceBills(unit_id, start_date),
    ]);
  } catch (err) {
    return {
      error: `Failed to load billable charges: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const memberGuestMeals = new Map<string, typeof guestMeals>();
  for (const gm of guestMeals) {
    const list = memberGuestMeals.get(gm.host_profile_id) ?? [];
    list.push(gm);
    memberGuestMeals.set(gm.host_profile_id, list);
  }

  const { data: subscriptions } = await supabase
    .from('mess_subscriptions')
    .select('*')
    .eq('unit_id', unit_id)
    .eq('is_active', true);

  const memberMiscDebits = new Map<string, typeof miscDebits>();
  for (const md of miscDebits) {
    const list = memberMiscDebits.get(md.profile_id) ?? [];
    list.push(md);
    memberMiscDebits.set(md.profile_id, list);
  }

  const memberPartyCharges = new Map<string, typeof partyCharges>();
  for (const pc of partyCharges) {
    const list = memberPartyCharges.get(pc.profile_id) ?? [];
    list.push(pc);
    memberPartyCharges.set(pc.profile_id, list);
  }

  const memberArrears = groupMemberArrears(arrearSources, start_date);

  const flatRateCache = new Map<string, Record<MessingMealType, number>>();
  if (billingMode === 'FLAT_RATE') {
    for (const d of cycleDates) {
      flatRateCache.set(d, await getActiveFlatRates(unit_id, d));
    }
  }

  const billsToInsert: MessBillInsert[] = [];
  const lineItemsToInsert: MessBillLineInsert[] = [];
  const guestMealsToMark: string[] = [];
  const miscDebitsToMark: string[] = [];
  const partyChargesToMark: string[] = [];
  const roomBillsToMark: string[] = [];

  let memberSeq = 1;
  for (const member of members) {
    let messingAmount = 0;
    let barAmount = 0;
    let roomAmount = 0;
    let guestMealAmount = 0;
    let subscriptionsAmount = 0;
    let miscAmount = 0;
    let partyAmount = 0;

    const currentBillId = crypto.randomUUID();
    const billNumber = `MB-${billing_year}-${String(billing_month).padStart(2, '0')}-${String(memberSeq++).padStart(3, '0')}`;

    if (member.dining_in !== false) {
      const messing = calculateMemberMessingCycle({
        billingMode,
        cycleDates,
        isAbsentOnDate: (dateStr) => {
          const attDay = attendanceByDate.get(dateStr);
          return attDay ? absenteeSet.has(`${attDay.id}:${member.id}`) : !member.dining_in;
        },
        pRates: approvedPRates,
        flatRatesOnDate: (dateStr) => flatRateCache.get(dateStr) ?? EMPTY_FLAT_RATES,
        isMealCut: (dateStr, meal) => cutSet.has(`${member.id}:${dateStr}:${meal}`),
      });
      messingAmount = messing.total;
      for (const item of messing.items) {
        lineItemsToInsert.push({
          bill_id: currentBillId,
          category: 'messing',
          item_date: item.date,
          description: item.description,
          quantity: 1,
          unit_rate: item.amount,
          amount: item.amount,
        });
      }
    }

    const chits = memberBarChits.get(member.id) ?? [];
    for (const c of chits) {
      barAmount += c.amount;
      lineItemsToInsert.push({
        bill_id: currentBillId,
        category: 'bar',
        item_date: c.date,
        description: `Bar Chit (${c.date})`,
        quantity: 1,
        unit_rate: c.amount,
        amount: c.amount,
        reference_id: c.id,
      });
    }

    const rbs = (memberRoomBills.get(member.id) ?? []).filter((rb) => {
      const flags = roomBillFlags.get(rb.id);
      return !flags || isChargeBillableForPeriod(flags, billing_period_id);
    });
    for (const rb of rbs) {
      roomAmount += rb.amount;
      roomBillsToMark.push(rb.id);
      lineItemsToInsert.push({
        bill_id: currentBillId,
        category: 'room',
        item_date: rb.date,
        description: `Guest Room: ${rb.roomName} (${rb.guestName})`,
        quantity: 1,
        unit_rate: rb.amount,
        amount: rb.amount,
        reference_id: rb.id,
      });
    }

    const gms = memberGuestMeals.get(member.id) ?? [];
    for (const gm of gms) {
      guestMealAmount += Number(gm.total_amount);
      guestMealsToMark.push(gm.id);
      lineItemsToInsert.push({
        bill_id: currentBillId,
        category: 'guest_meal',
        item_date: gm.meal_date,
        description: `Guest Dining: ${gm.guest_count} guest(s) (${gm.meal_type})`,
        quantity: gm.guest_count,
        unit_rate: Number(gm.rate_charged),
        amount: Number(gm.total_amount),
        reference_id: gm.id,
      });
    }

    for (const sub of subscriptions ?? []) {
      const subAmt = Number(sub.amount);
      subscriptionsAmount += subAmt;
      lineItemsToInsert.push({
        bill_id: currentBillId,
        category: 'subscription',
        item_date: end_date,
        description: `Subscription: ${sub.name}`,
        quantity: 1,
        unit_rate: subAmt,
        amount: subAmt,
        reference_id: sub.id,
      });
    }

    const mds = memberMiscDebits.get(member.id) ?? [];
    for (const md of mds) {
      const amt = Number(md.amount);
      miscAmount += amt;
      miscDebitsToMark.push(md.id);
      lineItemsToInsert.push({
        bill_id: currentBillId,
        category: 'misc',
        item_date: md.charge_date,
        description: `Recovery: ${md.description}`,
        quantity: 1,
        unit_rate: amt,
        amount: amt,
        reference_id: md.id,
      });
    }

    const pcs = memberPartyCharges.get(member.id) ?? [];
    for (const pc of pcs) {
      const amt = Number(pc.amount);
      partyAmount += amt;
      partyChargesToMark.push(pc.id);
      lineItemsToInsert.push({
        bill_id: currentBillId,
        category: 'party',
        item_date: pc.party_date,
        description: `Party: ${pc.description}`,
        quantity: 1,
        unit_rate: amt,
        amount: amt,
        reference_id: pc.id,
      });
    }

    const arrearsAmount = memberArrears.get(member.id) ?? 0;
    if (arrearsAmount > 0) {
      lineItemsToInsert.push({
        bill_id: currentBillId,
        category: 'arrear',
        item_date: start_date,
        description: 'Arrears from prior bills',
        quantity: 1,
        unit_rate: arrearsAmount,
        amount: arrearsAmount,
      });
    }

    const totalAmount = totalMessBillAmount({
      messingAmount,
      barAmount,
      roomAmount,
      guestMealAmount,
      subscriptionsAmount,
      miscAmount,
      partyAmount,
      arrearsAmount,
    });

    billsToInsert.push({
      id: currentBillId,
      unit_id,
      billing_period_id,
      profile_id: member.id,
      bill_number: billNumber,
      messing_amount: roundMoney(messingAmount),
      bar_amount: roundMoney(barAmount),
      room_amount: roundMoney(roomAmount),
      guest_meal_amount: roundMoney(guestMealAmount),
      subscriptions_amount: roundMoney(subscriptionsAmount),
      misc_amount: roundMoney(miscAmount),
      party_amount: roundMoney(partyAmount),
      arrears_amount: roundMoney(arrearsAmount),
      total_amount: totalAmount,
      status: 'draft',
      due_date: dueDate,
    });
  }

  await supabase.from('mess_bills').delete().eq('billing_period_id', billing_period_id);

  if (billsToInsert.length > 0) {
    const { error: bErr } = await supabase.from('mess_bills').insert(billsToInsert);
    if (bErr) {
      return { error: `Failed to insert bills: ${bErr.message}` };
    }
  }

  if (lineItemsToInsert.length > 0) {
    const { error: liErr } = await supabase.from('mess_bill_line_items').insert(lineItemsToInsert);
    if (liErr) {
      return { error: `Failed to insert line items: ${liErr.message}` };
    }
  }

  await Promise.all([
    markChargesBilled(supabase, 'guest_meals', guestMealsToMark, billing_period_id),
    markChargesBilled(supabase, 'mess_misc_debits', miscDebitsToMark, billing_period_id),
    markChargesBilled(supabase, 'mess_party_charges', partyChargesToMark, billing_period_id),
    markChargesBilled(supabase, 'room_bills', roomBillsToMark, billing_period_id),
  ]);

  await supabase
    .from('mess_billing_periods')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', billing_period_id);

  revalidatePath('/billing');
  return { ok: true, data: { generatedBillsCount: billsToInsert.length } };
}

/**
 * Publishes draft mess bills making them visible to individual officers.
 */
export async function publishBillingPeriodAction(input: unknown): Promise<ActionResult> {
  const parsed = publishBillsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const { billing_period_id } = parsed.data;
  const supabase = await createClient();

  const { data: period } = await supabase
    .from('mess_billing_periods')
    .select('unit_id')
    .eq('id', billing_period_id)
    .single();

  if (!period) return { error: 'Billing period not found' };

  const user = await requireCapability('billing.finalize', period.unit_id);

  // Update bills to published
  await supabase
    .from('mess_bills')
    .update({
      status: 'published',
      updated_at: new Date().toISOString(),
    })
    .eq('billing_period_id', billing_period_id);

  // Update period to published
  await supabase
    .from('mess_billing_periods')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', billing_period_id);

  revalidatePath('/billing');
  try {
    await notifyBillsPublished(billing_period_id);
  } catch (err) {
    console.error('Bill publish email batch failed:', err);
  }
  return { ok: true };
}

/**
 * Records an officer's dues settlement/payment.
 */
export async function markBillPaidAction(input: unknown): Promise<ActionResult> {
  const parsed = markBillPaidSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const { bill_id, paid_amount, payment_method, payment_reference, notes } = parsed.data;
  const supabase = await createClient();

  const { data: bill } = await supabase
    .from('mess_bills')
    .select('unit_id, total_amount')
    .eq('id', bill_id)
    .single();

  if (!bill) return { error: 'Bill not found' };

  await requireCapability('billing.finalize', bill.unit_id);

  const { error } = await supabase
    .from('mess_bills')
    .update({
      status: 'paid',
      paid_amount,
      paid_at: new Date().toISOString(),
      payment_method,
      payment_reference: payment_reference ?? null,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bill_id);

  if (error) {
    return { error: `Failed to record payment: ${error.message}` };
  }

  revalidatePath('/billing');
  return { ok: true };
}

/**
 * Adds a recurring monthly subscription (e.g. Mess Maintenance, Sports Club).
 */
export async function createSubscriptionAction(input: unknown): Promise<ActionResult> {
  const parsed = createSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid subscription input', details: parsed.error.flatten() };
  }

  await requireCapability('billing.finalize', parsed.data.unit_id);
  const supabase = await createClient();

  const { error } = await supabase.from('mess_subscriptions').insert({
    unit_id: parsed.data.unit_id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    amount: parsed.data.amount,
  });

  if (error) {
    return { error: `Failed to add subscription: ${error.message}` };
  }

  revalidatePath('/billing');
  return { ok: true };
}

/**
 * Adds an ad-hoc recovery / misc debit against a member.
 */
export async function createMiscDebitAction(input: unknown): Promise<ActionResult> {
  const parsed = createMiscDebitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid misc debit input', details: parsed.error.flatten() };
  }

  const user = await requireCapability('billing.draft', parsed.data.unit_id);
  const supabase = await createClient();

  const { error } = await supabase.from('mess_misc_debits').insert({
    unit_id: parsed.data.unit_id,
    profile_id: parsed.data.profile_id,
    charge_date: parsed.data.charge_date,
    category: parsed.data.category,
    description: parsed.data.description,
    amount: parsed.data.amount,
    receipt_ref: parsed.data.receipt_ref ?? null,
    created_by: user.id,
  });

  if (error) {
    return { error: `Failed to record misc debit: ${error.message}` };
  }

  revalidatePath('/billing');
  return { ok: true };
}

/**
 * Fetches bill details for client components without leaking server-only queries.
 */
export async function getMessBillDetailsAction(billId: string) {
  const user = await requireUser();
  const bill = await getMessBillDetails(billId);
  if (!bill) return null;
  if (bill.profile_id === user.id) return bill;
  if (
    userHasCapability(user, 'billing.draft', bill.unit_id) ||
    userHasCapability(user, 'billing.finalize', bill.unit_id)
  ) {
    return bill;
  }
  return { error: 'Forbidden' };
}

/**
 * Deactivates a recurring subscription so it is excluded from the next billing run.
 */
export async function deactivateSubscriptionAction(
  subscriptionId: string
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(subscriptionId).success) {
    return { error: 'Invalid subscription id' };
  }

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from('mess_subscriptions')
    .select('id, unit_id')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!sub) return { error: 'Subscription not found' };

  await requireCapability('billing.draft', sub.unit_id);

  const { error } = await supabase
    .from('mess_subscriptions')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', subscriptionId);

  if (error) {
    return { error: `Failed to deactivate subscription: ${error.message}` };
  }

  revalidatePath('/billing');
  return { ok: true };
}

const createPartyChargeSchema = z.object({
  unit_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  party_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(2).max(255),
  amount: z.coerce.number().positive(),
});

/**
 * Records a party / function charge against a member for the next billing run.
 */
export async function createPartyChargeAction(input: unknown): Promise<ActionResult> {
  const parsed = createPartyChargeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid party charge input', details: parsed.error.flatten() };
  }

  const user = await requireCapability('billing.draft', parsed.data.unit_id);
  const supabase = await createClient();

  // Table exists in 20260910080100; generated Database types may lag.
  const { error } = await (
    supabase as unknown as {
      from: (relation: 'mess_party_charges') => {
        insert: (values: {
          unit_id: string;
          profile_id: string;
          party_date: string;
          description: string;
          amount: number;
          created_by: string;
        }) => PromiseLike<{ error: { message: string } | null }>;
      };
    }
  )
    .from('mess_party_charges')
    .insert({
      unit_id: parsed.data.unit_id,
      profile_id: parsed.data.profile_id,
      party_date: parsed.data.party_date,
      description: parsed.data.description,
      amount: parsed.data.amount,
      created_by: user.id,
    });

  if (error) {
    return { error: `Failed to record party charge: ${error.message}` };
  }

  revalidatePath('/billing');
  return { ok: true };
}
