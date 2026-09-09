'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/auth/require-capability';
import {
  createBillingPeriodSchema,
  runBillingSchema,
  publishBillsSchema,
  markBillPaidSchema,
  createSubscriptionSchema,
  createMiscDebitSchema,
} from '@/lib/schemas/billing';
import { format, addDays, parseISO } from 'date-fns';
import type { MessingMealType, MessingBillingMode } from '@/lib/schemas/messing';
import { getActiveFlatRates } from '@/lib/messing/queries';
import {
  getBillableBarChitsForPeriod,
  getHostChargeRoomBillsForPeriod,
  getMessBillDetails,
} from './queries';
import { groupHostChargeRoomBills, groupMemberBarChits } from './compute';

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
  const user = await requireCapability('billing.draft', unit_id);
  const supabase = await createClient();

  // 1. Fetch the billing period
  const { data: period, error: periodErr } = await supabase
    .from('mess_billing_periods')
    .select('*')
    .eq('id', billing_period_id)
    .single();

  if (periodErr || !period) {
    return { error: 'Billing period not found' };
  }

  const { start_date, end_date, billing_year, billing_month } = period;

  // 2. Fetch Unit config (billing mode)
  const { data: unitData } = await supabase
    .from('units')
    .select('messing_billing_mode')
    .eq('id', unit_id)
    .single();

  const billingMode: MessingBillingMode =
    (unitData?.messing_billing_mode as MessingBillingMode) ?? 'P_REGISTER_SPLIT';

  // 3. Fetch dining members in the unit
  const { data: members, error: memErr } = await supabase
    .from('profiles')
    .select('id, full_name, service_no, rank, dining_in')
    .eq('unit_id', unit_id);

  if (memErr || !members || members.length === 0) {
    return { error: 'No members found in this unit to bill.' };
  }

  // 4. Fetch daily P-rates in the period
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

  // 5. Fetch attendance headers and absences in date range
  const { data: attendanceDays } = await supabase
    .from('attendance_days')
    .select('id, attendance_date')
    .eq('unit_id', unit_id)
    .gte('attendance_date', start_date)
    .lte('attendance_date', end_date);

  const dayIds = (attendanceDays ?? []).map((d) => d.id);
  const dayIdToDate = new Map<string, string>();
  for (const d of attendanceDays ?? []) {
    dayIdToDate.set(d.id, d.attendance_date);
  }

  const { data: absences } = await supabase
    .from('attendance_absences')
    .select('day_id, profile_id')
    .in('day_id', dayIds);

  const absenteeSet = new Set<string>(); // "day_id:profile_id"
  for (const a of absences ?? []) {
    if (a.profile_id) {
      absenteeSet.add(`${a.day_id}:${a.profile_id}`);
    }
  }

  // 6. Fetch meal cuts in date range
  const { data: mealCuts } = await supabase
    .from('mess_meal_cuts')
    .select('*')
    .eq('unit_id', unit_id)
    .gte('cut_date', start_date)
    .lte('cut_date', end_date)
    .eq('status', 'approved');

  const cutSet = new Set<string>(); // "profile_id:date:meal_type"
  for (const c of mealCuts ?? []) {
    cutSet.add(`${c.profile_id}:${c.cut_date}:${c.meal_type}`);
  }

  // 7. Member bar chits (finalized, profile_id set, booking_id null — guest chits stay on the folio)
  let barChits;
  try {
    barChits = await getBillableBarChitsForPeriod(unit_id, start_date, end_date);
  } catch (err) {
    return { error: `Failed to load bar chits: ${err instanceof Error ? err.message : String(err)}` };
  }
  const memberBarChits = groupMemberBarChits(barChits);

  // 8. Host room folios (CHARGE_TO_HOST + transferred_to_mess_bill, keyed by host_profile_id)
  let roomBills;
  try {
    roomBills = await getHostChargeRoomBillsForPeriod(unit_id, start_date, end_date);
  } catch (err) {
    return { error: `Failed to load room bills: ${err instanceof Error ? err.message : String(err)}` };
  }
  const memberRoomBills = groupHostChargeRoomBills(roomBills, start_date, end_date);

  // 9. Fetch casual guest meals in date range
  const { data: guestMeals } = await supabase
    .from('guest_meals')
    .select('*')
    .eq('unit_id', unit_id)
    .gte('meal_date', start_date)
    .lte('meal_date', end_date);

  const memberGuestMeals = new Map<string, typeof guestMeals>();
  for (const gm of guestMeals ?? []) {
    const list = memberGuestMeals.get(gm.host_profile_id) ?? [];
    list.push(gm);
    memberGuestMeals.set(gm.host_profile_id, list);
  }

  // 10. Fetch recurring unit subscriptions
  const { data: subscriptions } = await supabase
    .from('mess_subscriptions')
    .select('*')
    .eq('unit_id', unit_id)
    .eq('is_active', true);

  // 11. Fetch unbilled misc debits up to end_date
  const { data: miscDebits } = await supabase
    .from('mess_misc_debits')
    .select('*')
    .eq('unit_id', unit_id)
    .eq('is_billed', false)
    .lte('charge_date', end_date);

  const memberMiscDebits = new Map<string, typeof miscDebits>();
  for (const md of miscDebits ?? []) {
    const list = memberMiscDebits.get(md.profile_id) ?? [];
    list.push(md);
    memberMiscDebits.set(md.profile_id, list);
  }

  // Due date is standard 10th of following month
  const dueDate = format(addDays(parseISO(end_date), 16), 'yyyy-MM-10');

  // Build calendar dates in cycle
  const curDate = parseISO(start_date);
  const stopDate = parseISO(end_date);
  const cycleDates: string[] = [];
  let dIter = curDate;
  while (dIter <= stopDate) {
    cycleDates.push(format(dIter, 'yyyy-MM-dd'));
    dIter = addDays(dIter, 1);
  }

  // Cache flat rates per day if in flat rate mode
  const flatRateCache = new Map<string, Record<MessingMealType, number>>();
  if (billingMode === 'FLAT_RATE') {
    for (const d of cycleDates) {
      flatRateCache.set(d, await getActiveFlatRates(unit_id, d));
    }
  }

  // 12. Compile each officer's bill
  const billsToInsert: any[] = [];
  const lineItemsToInsert: any[] = [];
  const miscDebitsToMarkBilled: string[] = [];

  let memberSeq = 1;
  for (const member of members) {
    let messingAmount = 0;
    let barAmount = 0;
    let roomAmount = 0;
    let guestMealAmount = 0;
    let subscriptionsAmount = 0;
    let miscAmount = 0;

    const currentBillId = crypto.randomUUID();
    const billNumber = `MB-${billing_year}-${String(billing_month).padStart(2, '0')}-${String(memberSeq++).padStart(3, '0')}`;

    // A. Messing Calculation
    if (billingMode === 'P_REGISTER_SPLIT') {
      for (const dateStr of cycleDates) {
        // Find attendance day
        const attDay = (attendanceDays ?? []).find((ad) => ad.attendance_date === dateStr);
        const isAbsent = attDay ? absenteeSet.has(`${attDay.id}:${member.id}`) : !member.dining_in;

        if (!isAbsent) {
          const pRate = pRateMap.get(dateStr) ?? 0;
          if (pRate > 0) {
            messingAmount += pRate;
            lineItemsToInsert.push({
              bill_id: currentBillId,
              category: 'messing',
              item_date: dateStr,
              description: `Daily Messing (P-Rate) for ${dateStr}`,
              quantity: 1,
              unit_rate: pRate,
              amount: pRate,
            });
          }
        }
      }
    } else {
      // FLAT_RATE
      const primaryMeals: MessingMealType[] = ['breakfast', 'lunch', 'dinner'];
      for (const dateStr of cycleDates) {
        const attDay = (attendanceDays ?? []).find((ad) => ad.attendance_date === dateStr);
        const isAbsent = attDay ? absenteeSet.has(`${attDay.id}:${member.id}`) : !member.dining_in;

        if (!isAbsent) {
          const rates = flatRateCache.get(dateStr)!;
          for (const m of primaryMeals) {
            const isCut = cutSet.has(`${member.id}:${dateStr}:${m}`);
            if (!isCut) {
              const rate = rates[m] ?? 0;
              if (rate > 0) {
                messingAmount += rate;
                lineItemsToInsert.push({
                  bill_id: currentBillId,
                  category: 'messing',
                  item_date: dateStr,
                  description: `Messing - ${m.toUpperCase()} (${dateStr})`,
                  quantity: 1,
                  unit_rate: rate,
                  amount: rate,
                });
              }
            }
          }
        }
      }
    }

    // B. Bar Chits
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

    // C. Guest Rooms
    const rbs = memberRoomBills.get(member.id) ?? [];
    for (const rb of rbs) {
      roomAmount += rb.amount;
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

    // D. Casual Guest Meals
    const gms = memberGuestMeals.get(member.id) ?? [];
    for (const gm of gms) {
      guestMealAmount += Number(gm.total_amount);
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

    // E. Monthly Subscriptions
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

    // F. Miscellaneous Debits
    const mds = memberMiscDebits.get(member.id) ?? [];
    for (const md of mds) {
      const amt = Number(md.amount);
      miscAmount += amt;
      miscDebitsToMarkBilled.push(md.id);
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

    const totalAmount =
      messingAmount + barAmount + roomAmount + guestMealAmount + subscriptionsAmount + miscAmount;

    billsToInsert.push({
      id: currentBillId,
      unit_id,
      billing_period_id,
      profile_id: member.id,
      bill_number: billNumber,
      messing_amount: Math.round(messingAmount * 100) / 100,
      bar_amount: Math.round(barAmount * 100) / 100,
      room_amount: Math.round(roomAmount * 100) / 100,
      guest_meal_amount: Math.round(guestMealAmount * 100) / 100,
      subscriptions_amount: Math.round(subscriptionsAmount * 100) / 100,
      misc_amount: Math.round(miscAmount * 100) / 100,
      arrears_amount: 0,
      total_amount: Math.round(totalAmount * 100) / 100,
      status: 'draft',
      due_date: dueDate,
    });
  }

  // 13. Persist bills and line items inside Supabase
  // Delete any existing draft bills for this period first to allow clean recalculation
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

  // Mark misc debits as billed
  if (miscDebitsToMarkBilled.length > 0) {
    await supabase
      .from('mess_misc_debits')
      .update({ is_billed: true })
      .in('id', miscDebitsToMarkBilled);
  }

  // Update billing period status to draft
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
  return getMessBillDetails(billId);
}
