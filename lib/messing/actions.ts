'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireRole, requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import type { AuthUser } from '@/lib/auth/types';
import {
  updateUnitFlatRatesSchema,
  dailyKitchenExpenditureSchema,
  mealCutInputSchema,
  guestMealInputSchema,
  submitDailyRegisterSchema,
  approveDailyRegisterSchema,
  rejectDailyRegisterSchema,
  approveMealCutSchema,
  rejectMealCutSchema,
} from '@/lib/schemas/messing';
import { format, subDays, parseISO } from 'date-fns';
import { recalculateDailyPRate } from './prate';
import type { MessingMealType } from '@/lib/schemas/messing';
import type {
  MessingFlatRate,
  MessDailyExpenditure,
  MessMealCut,
  GuestMeal,
} from './types';

type ActionResult = { ok: true; data?: unknown } | { error: string; details?: unknown };

function unitMismatch(user: AuthUser, unitId: string): string | null {
  if (user.homeUnitId === unitId || user.activeUnitId === unitId) return null;
  return 'You can only act on your assigned unit.';
}

function revalidateMessing() {
  revalidatePath('/messing');
  revalidatePath('/messing/cuts');
  revalidatePath('/dashboard');
}

/**
 * Updates flat rates for a unit (Mess Secretary / Admin)
 */
export async function updateUnitFlatRatesAction(input: unknown): Promise<ActionResult> {
  const parsed = updateUnitFlatRatesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const { unit_id, rates } = parsed.data;

  const user = await requireRole(['super_admin', 'unit_admin']);
  const mismatch = unitMismatch(user, unit_id);
  if (mismatch) return { error: mismatch };

  const db = await getDb();
  const ratesCol = db.collection<MessingFlatRate>('messing_flat_rates');

  try {
    const now = new Date().toISOString();

    for (const rateInput of rates) {
      const existingRate = await ratesCol.findOne({
        unit_id,
        meal_type: rateInput.meal_type,
        valid_from: rateInput.valid_from,
      });

      if (existingRate) {
        const patch = {
          rate: rateInput.rate,
          updated_by: user.id,
          updated_at: now,
        };
        await ratesCol.updateOne({ id: existingRate.id }, { $set: patch });
        await writeAudit({
          table_name: 'messing_flat_rates',
          row_pk: existingRate.id,
          op: 'UPDATE',
          active_unit_id: unit_id,
          changed_by: user.id,
          old_data: { rate: existingRate.rate },
          new_data: { rate: rateInput.rate },
        });
      } else {
        const overlappingRate = await ratesCol.findOne({
          unit_id,
          meal_type: rateInput.meal_type,
          valid_from: { $lt: rateInput.valid_from },
          $or: [{ valid_to: null }, { valid_to: { $gte: rateInput.valid_from } }],
        });

        if (overlappingRate) {
          const previousDay = format(subDays(parseISO(rateInput.valid_from), 1), 'yyyy-MM-dd');
          const patch = {
            valid_to: previousDay,
            updated_by: user.id,
            updated_at: now,
          };
          await ratesCol.updateOne({ id: overlappingRate.id }, { $set: patch });
          await writeAudit({
            table_name: 'messing_flat_rates',
            row_pk: overlappingRate.id,
            op: 'UPDATE',
            active_unit_id: unit_id,
            changed_by: user.id,
            old_data: { valid_to: overlappingRate.valid_to },
            new_data: { valid_to: previousDay },
          });
        }

        const newId = crypto.randomUUID();
        const doc: MessingFlatRate = {
          id: newId,
          unit_id,
          meal_type: rateInput.meal_type,
          rate: rateInput.rate,
          valid_from: rateInput.valid_from,
          valid_to: null,
          created_by: user.id,
          updated_by: user.id,
          created_at: now,
          updated_at: now,
        };

        await ratesCol.insertOne(doc);
        await writeAudit({
          table_name: 'messing_flat_rates',
          row_pk: newId,
          op: 'INSERT',
          active_unit_id: unit_id,
          changed_by: user.id,
          new_data: doc as unknown as Record<string, unknown>,
        });
      }
    }

    revalidatePath('/settings');
    revalidatePath('/messing');
    return { ok: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Unknown error updating flat rates' };
  }
}

/**
 * Mess Havildar records daily kitchen expenditures.
 * Saving always reopens the register as draft; P-rate is recalculated
 * only from finalized attendance (via recalculateDailyPRate).
 */
export async function recordDailyKitchenExpenditureAction(input: unknown): Promise<ActionResult> {
  const parsed = dailyKitchenExpenditureSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid expenditure input', details: parsed.error.flatten() };
  }

  const {
    unit_id,
    expenditure_date,
    morning_amount,
    afternoon_amount,
    dinner_amount,
    notes,
    receipt_ref,
    vendor_name,
    sourcing_category,
  } = parsed.data;

  const user = await requireCapability('attendance.write', unit_id);
  const mismatch = unitMismatch(user, unit_id);
  if (mismatch) return { error: mismatch };

  const db = await getDb();
  const expCol = db.collection<MessDailyExpenditure>('mess_daily_expenditures');
  const total_amount = morning_amount + afternoon_amount + dinner_amount;
  const now = new Date().toISOString();

  const existing = await expCol.findOne({
    unit_id,
    expenditure_date,
  });

  if (existing) {
    const patch = {
      morning_amount,
      afternoon_amount,
      dinner_amount,
      total_amount,
      notes: notes ?? null,
      receipt_ref: receipt_ref ?? null,
      vendor_name: vendor_name ?? null,
      sourcing_category,
      register_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      approved_at: null,
      approved_by: null,
      rejected_at: null,
      rejected_by: null,
      reject_reason: null,
      updated_by: user.id,
      updated_at: now,
    };

    await expCol.updateOne({ id: existing.id }, { $set: patch });
    await writeAudit({
      table_name: 'mess_daily_expenditures',
      row_pk: existing.id,
      op: 'UPDATE',
      active_unit_id: unit_id,
      changed_by: user.id,
      old_data: existing as unknown as Record<string, unknown>,
      new_data: patch,
    });
  } else {
    const newId = crypto.randomUUID();
    const doc: MessDailyExpenditure = {
      id: newId,
      unit_id,
      expenditure_date,
      morning_amount,
      afternoon_amount,
      dinner_amount,
      total_amount,
      notes: notes ?? null,
      receipt_ref: receipt_ref ?? null,
      vendor_name: vendor_name ?? null,
      sourcing_category,
      register_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      approved_at: null,
      approved_by: null,
      rejected_at: null,
      rejected_by: null,
      reject_reason: null,
      created_by: user.id,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
    };

    await expCol.insertOne(doc);
    await writeAudit({
      table_name: 'mess_daily_expenditures',
      row_pk: newId,
      op: 'INSERT',
      active_unit_id: unit_id,
      changed_by: user.id,
      new_data: doc as unknown as Record<string, unknown>,
    });
  }

  const pResult = await recalculateDailyPRate(unit_id, expenditure_date, user.id);
  if ('error' in pResult) {
    return { error: `Expenditure saved, but failed to update P-rate: ${pResult.error}` };
  }

  revalidateMessing();
  revalidatePath('/attendance');
  return {
    ok: true,
    data: {
      total_amount,
      presentCount: pResult.presentCount,
      ratePerDiner: pResult.ratePerDiner,
    },
  };
}

/** Alias used by `/api/v1/messing/kitchen`. */
export const saveKitchenExpenditureAction = recordDailyKitchenExpenditureAction;

export async function submitDailyRegisterAction(input: unknown): Promise<ActionResult> {
  const parsed = submitDailyRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const user = await requireCapability('attendance.write', parsed.data.unit_id);
  const mismatch = unitMismatch(user, parsed.data.unit_id);
  if (mismatch) return { error: mismatch };

  const db = await getDb();
  const expCol = db.collection<MessDailyExpenditure>('mess_daily_expenditures');

  const row = await expCol.findOne({
    unit_id: parsed.data.unit_id,
    expenditure_date: parsed.data.expenditure_date,
  });

  if (!row) return { error: 'No kitchen register exists for this date.' };
  if (row.register_status !== 'draft') {
    return { error: 'Only a draft register can be submitted.' };
  }

  const now = new Date().toISOString();
  const patch = {
    register_status: 'submitted',
    submitted_at: now,
    submitted_by: user.id,
    rejected_at: null,
    rejected_by: null,
    reject_reason: null,
    updated_by: user.id,
    updated_at: now,
  };

  await expCol.updateOne({ id: row.id }, { $set: patch });
  await writeAudit({
    table_name: 'mess_daily_expenditures',
    row_pk: row.id,
    op: 'UPDATE',
    active_unit_id: parsed.data.unit_id,
    changed_by: user.id,
    old_data: { register_status: row.register_status },
    new_data: patch,
  });

  revalidateMessing();
  return { ok: true };
}

export async function approveDailyRegisterAction(input: unknown): Promise<ActionResult> {
  const parsed = approveDailyRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const user = await requireCapability('messing.approve', parsed.data.unit_id);
  const mismatch = unitMismatch(user, parsed.data.unit_id);
  if (mismatch) return { error: mismatch };

  const db = await getDb();
  const expCol = db.collection<MessDailyExpenditure>('mess_daily_expenditures');

  const row = await expCol.findOne({
    unit_id: parsed.data.unit_id,
    expenditure_date: parsed.data.expenditure_date,
  });

  if (!row) return { error: 'No kitchen register exists for this date.' };
  if (row.register_status !== 'submitted') {
    return { error: 'Only a submitted register can be approved.' };
  }

  const now = new Date().toISOString();
  const patch = {
    register_status: 'approved',
    approved_at: now,
    approved_by: user.id,
    rejected_at: null,
    rejected_by: null,
    reject_reason: null,
    updated_by: user.id,
    updated_at: now,
  };

  await expCol.updateOne({ id: row.id }, { $set: patch });
  await writeAudit({
    table_name: 'mess_daily_expenditures',
    row_pk: row.id,
    op: 'UPDATE',
    active_unit_id: parsed.data.unit_id,
    changed_by: user.id,
    old_data: { register_status: row.register_status },
    new_data: patch,
  });

  revalidateMessing();
  return { ok: true };
}

export async function rejectDailyRegisterAction(input: unknown): Promise<ActionResult> {
  const parsed = rejectDailyRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const user = await requireCapability('messing.approve', parsed.data.unit_id);
  const mismatch = unitMismatch(user, parsed.data.unit_id);
  if (mismatch) return { error: mismatch };

  const db = await getDb();
  const expCol = db.collection<MessDailyExpenditure>('mess_daily_expenditures');

  const row = await expCol.findOne({
    unit_id: parsed.data.unit_id,
    expenditure_date: parsed.data.expenditure_date,
  });

  if (!row) return { error: 'No kitchen register exists for this date.' };
  if (row.register_status !== 'submitted') {
    return { error: 'Only a submitted register can be rejected.' };
  }

  const now = new Date().toISOString();
  const patch = {
    register_status: 'rejected',
    rejected_at: now,
    rejected_by: user.id,
    reject_reason: parsed.data.reject_reason ?? null,
    approved_at: null,
    approved_by: null,
    updated_by: user.id,
    updated_at: now,
  };

  await expCol.updateOne({ id: row.id }, { $set: patch });
  await writeAudit({
    table_name: 'mess_daily_expenditures',
    row_pk: row.id,
    op: 'UPDATE',
    active_unit_id: parsed.data.unit_id,
    changed_by: user.id,
    old_data: { register_status: row.register_status },
    new_data: patch,
  });

  revalidateMessing();
  return { ok: true };
}

/**
 * Officer or Mess Havildar records a meal cut (e.g. absent for dinner).
 * Status is approved when the actor has attendance.write; otherwise requested.
 */
export async function recordMealCutAction(input: unknown): Promise<ActionResult> {
  const parsed = mealCutInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid messing input', details: parsed.error.flatten() };
  }

  const currentUser = await requireUser();
  const mismatch = unitMismatch(currentUser, parsed.data.unit_id);
  if (mismatch) return { error: mismatch };

  const targetProfileId = parsed.data.profile_id ?? currentUser.id;
  const canWrite = userHasCapability(currentUser, 'attendance.write', parsed.data.unit_id);

  if (targetProfileId !== currentUser.id) {
    await requireCapability('attendance.write', parsed.data.unit_id);
  }

  const db = await getDb();
  const cutsCol = db.collection<MessMealCut>('mess_meal_cuts');
  const now = new Date().toISOString();
  const status = canWrite ? 'approved' : 'requested';

  const existing = await cutsCol.findOne({
    profile_id: targetProfileId,
    cut_date: parsed.data.cut_date,
    meal_type: parsed.data.meal_type,
  });

  if (existing) {
    const patch = {
      unit_id: parsed.data.unit_id,
      status,
      reason: parsed.data.reason ?? null,
      updated_at: now,
    };
    await cutsCol.updateOne({ id: existing.id }, { $set: patch });
    await writeAudit({
      table_name: 'mess_meal_cuts',
      row_pk: existing.id,
      op: 'UPDATE',
      active_unit_id: parsed.data.unit_id,
      changed_by: currentUser.id,
      old_data: existing as unknown as Record<string, unknown>,
      new_data: patch,
    });
  } else {
    const newId = crypto.randomUUID();
    const doc: MessMealCut = {
      id: newId,
      unit_id: parsed.data.unit_id,
      profile_id: targetProfileId,
      cut_date: parsed.data.cut_date,
      meal_type: parsed.data.meal_type,
      status,
      reason: parsed.data.reason ?? null,
      created_at: now,
      updated_at: now,
    };
    await cutsCol.insertOne(doc);
    await writeAudit({
      table_name: 'mess_meal_cuts',
      row_pk: newId,
      op: 'INSERT',
      active_unit_id: parsed.data.unit_id,
      changed_by: currentUser.id,
      new_data: doc as unknown as Record<string, unknown>,
    });
  }

  revalidateMessing();
  return { ok: true };
}

export async function approveMealCutAction(input: unknown): Promise<ActionResult> {
  const parsed = approveMealCutSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const user = await requireCapability('attendance.write', parsed.data.unit_id);
  const mismatch = unitMismatch(user, parsed.data.unit_id);
  if (mismatch) return { error: mismatch };

  const db = await getDb();
  const cutsCol = db.collection<MessMealCut>('mess_meal_cuts');

  const existing = await cutsCol.findOne({
    id: parsed.data.id,
    unit_id: parsed.data.unit_id,
    status: 'requested',
  });

  if (!existing) return { error: 'Messing is no longer pending.' };

  const now = new Date().toISOString();
  await cutsCol.updateOne(
    { id: existing.id },
    { $set: { status: 'approved', updated_at: now } }
  );

  await writeAudit({
    table_name: 'mess_meal_cuts',
    row_pk: existing.id,
    op: 'UPDATE',
    active_unit_id: parsed.data.unit_id,
    changed_by: user.id,
    old_data: { status: existing.status },
    new_data: { status: 'approved' },
  });

  revalidateMessing();
  return { ok: true };
}

export async function rejectMealCutAction(input: unknown): Promise<ActionResult> {
  const parsed = rejectMealCutSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const user = await requireCapability('attendance.write', parsed.data.unit_id);
  const mismatch = unitMismatch(user, parsed.data.unit_id);
  if (mismatch) return { error: mismatch };

  const db = await getDb();
  const cutsCol = db.collection<MessMealCut>('mess_meal_cuts');

  const existing = await cutsCol.findOne({
    id: parsed.data.id,
    unit_id: parsed.data.unit_id,
    status: 'requested',
  });

  if (!existing) return { error: 'Messing is no longer pending.' };

  const now = new Date().toISOString();
  await cutsCol.updateOne(
    { id: existing.id },
    {
      $set: {
        status: 'rejected',
        reason: parsed.data.reason ?? null,
        updated_at: now,
      },
    }
  );

  await writeAudit({
    table_name: 'mess_meal_cuts',
    row_pk: existing.id,
    op: 'UPDATE',
    active_unit_id: parsed.data.unit_id,
    changed_by: user.id,
    old_data: { status: existing.status, reason: existing.reason },
    new_data: { status: 'rejected', reason: parsed.data.reason ?? null },
  });

  revalidateMessing();
  return { ok: true };
}

/**
 * Cancels / deletes a meal cut.
 */
export async function cancelMealCutAction(input: {
  unit_id: string;
  cut_date: string;
  meal_type: string;
  profile_id?: string;
}): Promise<ActionResult> {
  const currentUser = await requireUser();
  const mismatch = unitMismatch(currentUser, input.unit_id);
  if (mismatch) return { error: mismatch };

  const targetProfileId = input.profile_id ?? currentUser.id;

  if (targetProfileId !== currentUser.id) {
    await requireCapability('attendance.write', input.unit_id);
  }

  const db = await getDb();
  const cutsCol = db.collection<MessMealCut>('mess_meal_cuts');

  const existing = await cutsCol.findOne({
    unit_id: input.unit_id,
    profile_id: targetProfileId,
    cut_date: input.cut_date,
    meal_type: input.meal_type as MessingMealType,
  });

  if (existing) {
    await cutsCol.deleteOne({ id: existing.id });
    await writeAudit({
      table_name: 'mess_meal_cuts',
      row_pk: existing.id,
      op: 'DELETE',
      active_unit_id: input.unit_id,
      changed_by: currentUser.id,
      old_data: existing as unknown as Record<string, unknown>,
    });
  }

  revalidateMessing();
  return { ok: true };
}

/**
 * Logs a casual guest meal hosted by an officer in the dining hall.
 */
export async function recordGuestMealAction(input: unknown): Promise<ActionResult> {
  const parsed = guestMealInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid guest meal input', details: parsed.error.flatten() };
  }

  const user = await requireUser();
  const mismatch = unitMismatch(user, parsed.data.unit_id);
  if (mismatch) return { error: mismatch };

  if (parsed.data.host_profile_id !== user.id) {
    await requireCapability('attendance.write', parsed.data.unit_id);
  }

  const db = await getDb();
  const guestCol = db.collection<GuestMeal>('guest_meals');
  const total_amount = parsed.data.guest_count * parsed.data.rate_charged;
  const now = new Date().toISOString();
  const newId = crypto.randomUUID();

  const doc: GuestMeal = {
    id: newId,
    unit_id: parsed.data.unit_id,
    host_profile_id: parsed.data.host_profile_id,
    meal_date: parsed.data.meal_date,
    meal_type: parsed.data.meal_type,
    guest_count: parsed.data.guest_count,
    guest_names: parsed.data.guest_names ?? null,
    rate_charged: parsed.data.rate_charged,
    total_amount,
    notes: parsed.data.notes ?? null,
    is_billed: false,
    billed_period_id: null,
    created_by: user.id,
    created_at: now,
  };

  await guestCol.insertOne(doc);
  await writeAudit({
    table_name: 'guest_meals',
    row_pk: newId,
    op: 'INSERT',
    active_unit_id: parsed.data.unit_id,
    changed_by: user.id,
    new_data: doc as unknown as Record<string, unknown>,
  });

  revalidateMessing();
  return { ok: true };
}
