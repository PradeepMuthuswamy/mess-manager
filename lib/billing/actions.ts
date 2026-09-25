'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongo';
import type { Document } from 'mongodb';
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
import type { MessBill, MessBillLineItem, MessBillingPeriod } from './types';

type MessBillInsert = MessBill;
type MessBillLineInsert = MessBillLineItem;
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
  periodId: string
): Promise<string | null> {
  const tables = [
    'guest_meals',
    'mess_misc_debits',
    'mess_party_charges',
    'room_bills',
  ] as const;
  const reset: BillingMark = { is_billed: false, billed_period_id: null };

  const db = await getDb();
  for (const table of tables) {
    try {
      await db.collection(table).updateMany(
        { billed_period_id: periodId },
        { $set: reset }
      );
    } catch (err) {
      return `Failed to unmark ${table} for re-run: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return null;
}

async function markChargesBilled(
  table: 'guest_meals' | 'mess_misc_debits' | 'mess_party_charges' | 'room_bills',
  ids: string[],
  periodId: string
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  try {
    await db.collection(table).updateMany(
      { id: { $in: ids } },
      { $set: { is_billed: true, billed_period_id: periodId } }
    );
  } catch (error) {
    console.error(`Failed to mark ${table} billed:`, error);
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

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const newPeriod: MessBillingPeriod = {
    id,
    unit_id,
    name,
    start_date,
    end_date,
    billing_year,
    billing_month,
    status: 'open',
    created_at: now,
    updated_at: now,
  };

  try {
    await db.collection('mess_billing_periods').insertOne(newPeriod);
  } catch (error) {
    return { error: `Failed to create billing period: ${error instanceof Error ? error.message : String(error)}` };
  }

  revalidatePath('/billing');
  return { ok: true, data: newPeriod };
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
  const db = await getDb();

  const periodDoc = await db.collection('mess_billing_periods').findOne({ id: billing_period_id });
  if (!periodDoc) {
    return { error: 'Billing period not found' };
  }
  const period = periodDoc as unknown as MessBillingPeriod;

  if (period.status === 'published' || period.status === 'closed') {
    return { error: 'Cannot recalculate a published or closed billing period' };
  }

  const unmarkError = await resetChargesForPeriod(billing_period_id);
  if (unmarkError) {
    return { error: unmarkError };
  }

  const { start_date, end_date, billing_year, billing_month } = period;
  const { dueDate } = deriveStandardBillingCycle(billing_year, billing_month);
  const cycleDates = calculateCycleDates(start_date, end_date);

  const unitData = await db.collection('units').findOne({ id: unit_id });
  const billingMode: MessingBillingMode =
    (unitData?.messing_billing_mode as MessingBillingMode) ?? 'P_REGISTER_SPLIT';

  const membersDocs = await db
    .collection('profiles')
    .find({ unit_id })
    .project({ id: 1, full_name: 1, service_no: 1, rank: 1, dining_in: 1 })
    .toArray();

  if (!membersDocs || membersDocs.length === 0) {
    return { error: 'No members found in this unit to bill.' };
  }

  const members = membersDocs.map((m: Document) => ({
    id: m.id as string,
    full_name: (m.full_name as string) ?? null,
    service_no: (m.service_no as string) ?? null,
    rank: (m.rank as string) ?? null,
    dining_in: Boolean(m.dining_in),
  }));

  const pRatesDocs = await db
    .collection('mess_daily_p_rates')
    .find({
      unit_id,
      rate_date: { $gte: start_date, $lte: end_date },
    })
    .toArray();

  const pRateMap = new Map<string, number>();
  for (const r of pRatesDocs) {
    pRateMap.set(r.rate_date as string, Number(r.rate_per_diner));
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

  const attendanceDaysDocs = await db
    .collection('attendance_days')
    .find({
      unit_id,
      attendance_date: { $gte: start_date, $lte: end_date },
    })
    .project({ id: 1, attendance_date: 1 })
    .toArray();

  const attendanceByDate = new Map<string, { id: string; attendance_date: string }>();
  for (const d of attendanceDaysDocs) {
    attendanceByDate.set(d.attendance_date as string, { id: d.id as string, attendance_date: d.attendance_date as string });
  }

  const dayIds = attendanceDaysDocs.map((d: Document) => d.id as string);
  const absencesDocs =
    dayIds.length > 0
      ? await db
          .collection('attendance_absences')
          .find({ day_id: { $in: dayIds } })
          .project({ day_id: 1, profile_id: 1 })
          .toArray()
      : [];

  const absenteeSet = new Set<string>();
  for (const a of absencesDocs) {
    if (a.profile_id) {
      absenteeSet.add(`${a.day_id}:${a.profile_id}`);
    }
  }

  const mealCutsDocs = await db
    .collection('mess_meal_cuts')
    .find({
      unit_id,
      cut_date: { $gte: start_date, $lte: end_date },
      status: 'approved',
    })
    .toArray();

  const cutSet = new Set<string>();
  for (const c of mealCutsDocs) {
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

  const subscriptionsDocs = await db
    .collection('mess_subscriptions')
    .find({ unit_id, is_active: true })
    .toArray();
  const subscriptions = subscriptionsDocs.map((s: Document) => ({
    id: s.id as string,
    unit_id: s.unit_id as string,
    name: s.name as string,
    description: (s.description as string) ?? null,
    amount: Number(s.amount),
    is_active: Boolean(s.is_active),
  }));

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
          id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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

  await db.collection('mess_bills').deleteMany({ billing_period_id });

  if (billsToInsert.length > 0) {
    try {
      await db.collection('mess_bills').insertMany(billsToInsert);
    } catch (bErr) {
      return { error: `Failed to insert bills: ${bErr instanceof Error ? bErr.message : String(bErr)}` };
    }
  }

  if (lineItemsToInsert.length > 0) {
    try {
      await db.collection('mess_bill_line_items').insertMany(lineItemsToInsert);
    } catch (liErr) {
      return { error: `Failed to insert line items: ${liErr instanceof Error ? liErr.message : String(liErr)}` };
    }
  }

  await Promise.all([
    markChargesBilled('guest_meals', guestMealsToMark, billing_period_id),
    markChargesBilled('mess_misc_debits', miscDebitsToMark, billing_period_id),
    markChargesBilled('mess_party_charges', partyChargesToMark, billing_period_id),
    markChargesBilled('room_bills', roomBillsToMark, billing_period_id),
  ]);

  await db
    .collection('mess_billing_periods')
    .updateOne(
      { id: billing_period_id },
      { $set: { status: 'draft', updated_at: new Date().toISOString() } }
    );

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
  const db = await getDb();

  const period = await db
    .collection('mess_billing_periods')
    .findOne({ id: billing_period_id });

  if (!period) return { error: 'Billing period not found' };

  const user = await requireCapability('billing.finalize', period.unit_id as string);

  // Update bills to published
  await db
    .collection('mess_bills')
    .updateMany(
      { billing_period_id },
      {
        $set: {
          status: 'published',
          updated_at: new Date().toISOString(),
        },
      }
    );

  // Update period to published
  await db
    .collection('mess_billing_periods')
    .updateOne(
      { id: billing_period_id },
      {
        $set: {
          status: 'published',
          published_at: new Date().toISOString(),
          published_by: user.id,
          updated_at: new Date().toISOString(),
        },
      }
    );

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
  const db = await getDb();

  const bill = await db
    .collection('mess_bills')
    .findOne({ id: bill_id });

  if (!bill) return { error: 'Bill not found' };

  await requireCapability('billing.finalize', bill.unit_id as string);

  try {
    await db
      .collection('mess_bills')
      .updateOne(
        { id: bill_id },
        {
          $set: {
            status: 'paid',
            paid_amount,
            paid_at: new Date().toISOString(),
            payment_method,
            payment_reference: payment_reference ?? null,
            notes: notes ?? null,
            updated_at: new Date().toISOString(),
          },
        }
      );
  } catch (error) {
    return { error: `Failed to record payment: ${error instanceof Error ? error.message : String(error)}` };
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
  const db = await getDb();
  const now = new Date().toISOString();

  try {
    await db.collection('mess_subscriptions').insertOne({
      id: crypto.randomUUID(),
      unit_id: parsed.data.unit_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      amount: parsed.data.amount,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  } catch (error) {
    return { error: `Failed to add subscription: ${error instanceof Error ? error.message : String(error)}` };
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
  const db = await getDb();
  const now = new Date().toISOString();

  try {
    await db.collection('mess_misc_debits').insertOne({
      id: crypto.randomUUID(),
      unit_id: parsed.data.unit_id,
      profile_id: parsed.data.profile_id,
      charge_date: parsed.data.charge_date,
      category: parsed.data.category,
      description: parsed.data.description,
      amount: parsed.data.amount,
      receipt_ref: parsed.data.receipt_ref ?? null,
      is_billed: false,
      billed_period_id: null,
      created_by: user.id,
      created_at: now,
    });
  } catch (error) {
    return { error: `Failed to record misc debit: ${error instanceof Error ? error.message : String(error)}` };
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

  const db = await getDb();
  const sub = await db
    .collection('mess_subscriptions')
    .findOne({ id: subscriptionId });

  if (!sub) return { error: 'Subscription not found' };

  await requireCapability('billing.draft', sub.unit_id as string);

  try {
    await db
      .collection('mess_subscriptions')
      .updateOne(
        { id: subscriptionId },
        { $set: { is_active: false, updated_at: new Date().toISOString() } }
      );
  } catch (error) {
    return { error: `Failed to deactivate subscription: ${error instanceof Error ? error.message : String(error)}` };
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
  const db = await getDb();
  const now = new Date().toISOString();

  try {
    await db.collection('mess_party_charges').insertOne({
      id: crypto.randomUUID(),
      unit_id: parsed.data.unit_id,
      profile_id: parsed.data.profile_id,
      party_date: parsed.data.party_date,
      description: parsed.data.description,
      amount: parsed.data.amount,
      is_billed: false,
      billed_period_id: null,
      created_by: user.id,
      created_at: now,
    });
  } catch (error) {
    return { error: `Failed to record party charge: ${error instanceof Error ? error.message : String(error)}` };
  }

  revalidatePath('/billing');
  return { ok: true };
}
