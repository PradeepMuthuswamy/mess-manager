'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
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

  const admin = createServiceClient();

  try {
    for (const rateInput of rates) {
      const { data: existingRate, error: checkErr } = await admin
        .from('messing_flat_rates')
        .select('id')
        .eq('unit_id', unit_id)
        .eq('meal_type', rateInput.meal_type)
        .eq('valid_from', rateInput.valid_from)
        .maybeSingle();

      if (checkErr) {
        return { error: `Failed to check existing rate: ${checkErr.message}` };
      }

      if (existingRate) {
        const { error: updateErr } = await admin
          .from('messing_flat_rates')
          .update({
            rate: rateInput.rate,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingRate.id);

        if (updateErr) {
          return { error: `Failed to update existing rate: ${updateErr.message}` };
        }
      } else {
        const { data: overlappingRate, error: overlapErr } = await admin
          .from('messing_flat_rates')
          .select('id, valid_from, valid_to')
          .eq('unit_id', unit_id)
          .eq('meal_type', rateInput.meal_type)
          .lt('valid_from', rateInput.valid_from)
          .or(`valid_to.is.null,valid_to.gte.${rateInput.valid_from}`)
          .maybeSingle();

        if (overlapErr) {
          return { error: `Failed to check overlapping rate: ${overlapErr.message}` };
        }

        if (overlappingRate) {
          const previousDay = format(subDays(parseISO(rateInput.valid_from), 1), 'yyyy-MM-dd');

          const { error: updateOverlapErr } = await admin
            .from('messing_flat_rates')
            .update({
              valid_to: previousDay,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', overlappingRate.id);

          if (updateOverlapErr) {
            return { error: `Failed to update overlapping rate: ${updateOverlapErr.message}` };
          }
        }

        const { error: insertErr } = await admin
          .from('messing_flat_rates')
          .insert({
            unit_id,
            meal_type: rateInput.meal_type,
            rate: rateInput.rate,
            valid_from: rateInput.valid_from,
            created_by: user.id,
            updated_by: user.id,
          });

        if (insertErr) {
          return { error: `Failed to insert new rate: ${insertErr.message}` };
        }
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

  const supabase = await createClient();
  const total_amount = morning_amount + afternoon_amount + dinner_amount;

  const { error: expErr } = await supabase
    .from('mess_daily_expenditures')
    .upsert(
      {
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
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'unit_id, expenditure_date' },
    );

  if (expErr) {
    return { error: `Failed to save kitchen expenditure: ${expErr.message}` };
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

  const supabase = await createClient();
  const { data: row, error: fetchErr } = await supabase
    .from('mess_daily_expenditures')
    .select('id, register_status')
    .eq('unit_id', parsed.data.unit_id)
    .eq('expenditure_date', parsed.data.expenditure_date)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!row) return { error: 'No kitchen register exists for this date.' };
  if (row.register_status !== 'draft') {
    return { error: 'Only a draft register can be submitted.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('mess_daily_expenditures')
    .update({
      register_status: 'submitted',
      submitted_at: now,
      submitted_by: user.id,
      rejected_at: null,
      rejected_by: null,
      reject_reason: null,
      updated_by: user.id,
      updated_at: now,
    })
    .eq('id', row.id);

  if (error) return { error: `Failed to submit register: ${error.message}` };

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

  const supabase = await createClient();
  const { data: row, error: fetchErr } = await supabase
    .from('mess_daily_expenditures')
    .select('id, register_status')
    .eq('unit_id', parsed.data.unit_id)
    .eq('expenditure_date', parsed.data.expenditure_date)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!row) return { error: 'No kitchen register exists for this date.' };
  if (row.register_status !== 'submitted') {
    return { error: 'Only a submitted register can be approved.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('mess_daily_expenditures')
    .update({
      register_status: 'approved',
      approved_at: now,
      approved_by: user.id,
      rejected_at: null,
      rejected_by: null,
      reject_reason: null,
      updated_by: user.id,
      updated_at: now,
    })
    .eq('id', row.id);

  if (error) return { error: `Failed to approve register: ${error.message}` };

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

  const supabase = await createClient();
  const { data: row, error: fetchErr } = await supabase
    .from('mess_daily_expenditures')
    .select('id, register_status')
    .eq('unit_id', parsed.data.unit_id)
    .eq('expenditure_date', parsed.data.expenditure_date)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!row) return { error: 'No kitchen register exists for this date.' };
  if (row.register_status !== 'submitted') {
    return { error: 'Only a submitted register can be rejected.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('mess_daily_expenditures')
    .update({
      register_status: 'rejected',
      rejected_at: now,
      rejected_by: user.id,
      reject_reason: parsed.data.reject_reason ?? null,
      approved_at: null,
      approved_by: null,
      updated_by: user.id,
      updated_at: now,
    })
    .eq('id', row.id);

  if (error) return { error: `Failed to reject register: ${error.message}` };

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
    return { error: 'Invalid meal cut input', details: parsed.error.flatten() };
  }

  const currentUser = await requireUser();
  const mismatch = unitMismatch(currentUser, parsed.data.unit_id);
  if (mismatch) return { error: mismatch };

  const targetProfileId = parsed.data.profile_id ?? currentUser.id;
  const canWrite = userHasCapability(currentUser, 'attendance.write', parsed.data.unit_id);

  if (targetProfileId !== currentUser.id) {
    await requireCapability('attendance.write', parsed.data.unit_id);
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('mess_meal_cuts')
    .upsert(
      {
        unit_id: parsed.data.unit_id,
        profile_id: targetProfileId,
        cut_date: parsed.data.cut_date,
        meal_type: parsed.data.meal_type,
        status: canWrite ? 'approved' : 'requested',
        reason: parsed.data.reason ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id, cut_date, meal_type' },
    );

  if (error) {
    return { error: `Failed to place meal cut: ${error.message}` };
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_meal_cuts')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('unit_id', parsed.data.unit_id)
    .eq('status', 'requested')
    .select('id')
    .maybeSingle();

  if (error) return { error: `Failed to approve meal cut: ${error.message}` };
  if (!data) return { error: 'Meal cut is no longer pending.' };

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_meal_cuts')
    .update({
      status: 'rejected',
      reason: parsed.data.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id)
    .eq('unit_id', parsed.data.unit_id)
    .eq('status', 'requested')
    .select('id')
    .maybeSingle();

  if (error) return { error: `Failed to reject meal cut: ${error.message}` };
  if (!data) return { error: 'Meal cut is no longer pending.' };

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

  const supabase = await createClient();

  const { error } = await supabase
    .from('mess_meal_cuts')
    .delete()
    .eq('unit_id', input.unit_id)
    .eq('profile_id', targetProfileId)
    .eq('cut_date', input.cut_date)
    .eq('meal_type', input.meal_type as MessingMealType);

  if (error) {
    return { error: `Failed to cancel meal cut: ${error.message}` };
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
  const supabase = await createClient();

  const total_amount = parsed.data.guest_count * parsed.data.rate_charged;

  const { error } = await supabase
    .from('guest_meals')
    .insert({
      unit_id: parsed.data.unit_id,
      host_profile_id: parsed.data.host_profile_id,
      meal_date: parsed.data.meal_date,
      meal_type: parsed.data.meal_type,
      guest_count: parsed.data.guest_count,
      guest_names: parsed.data.guest_names ?? null,
      rate_charged: parsed.data.rate_charged,
      total_amount,
      notes: parsed.data.notes ?? null,
      created_by: user.id,
    });

  if (error) {
    return { error: `Failed to record guest meal: ${error.message}` };
  }

  revalidateMessing();
  return { ok: true };
}
