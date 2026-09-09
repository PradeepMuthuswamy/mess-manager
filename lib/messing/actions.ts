'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireRole } from '@/lib/auth/require-role';
import { requireUser } from '@/lib/auth/require-role';
import {
  updateUnitFlatRatesSchema,
  dailyKitchenExpenditureSchema,
  mealCutInputSchema,
  guestMealInputSchema,
} from '@/lib/schemas/messing';
import { format, subDays, parseISO } from 'date-fns';
import { getAttendanceDay } from '@/lib/attendance/queries';

type ActionResult = { ok: true; data?: unknown } | { error: string; details?: unknown };

/**
 * Updates flat rates for a unit (Mess Secretary / Admin)
 */
export async function updateUnitFlatRatesAction(input: unknown): Promise<ActionResult> {
  const parsed = updateUnitFlatRatesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const { unit_id, rates } = parsed.data;

  // Verifies super_admin or unit_admin role
  const user = await requireRole(['super_admin', 'unit_admin']);
  if (user.role !== 'super_admin' && user.homeUnitId !== unit_id) {
    return { error: 'You can only configure your own unit.' };
  }

  const admin = createServiceClient();

  try {
    for (const rateInput of rates) {
      // Check if a rate starting exactly on this day already exists.
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
        // If so, update it.
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
        // If not, check if there is an active rate overlapping with valid_from.
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
          // set its valid_to = valid_from - 1 day
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

        // Insert the new rate record.
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
 * Mess Havildar records daily kitchen expenditures (Morning, Afternoon, Dinner)
 * and automatically computes the daily per-capita rate P_d.
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

  // Authorization: Mess Havildar / Attendance write capability
  const user = await requireCapability('attendance.write', unit_id);
  const supabase = await createClient();

  const total_amount = morning_amount + afternoon_amount + dinner_amount;

  // 1. Upsert daily expenditure
  const { data: expRow, error: expErr } = await supabase
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
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'unit_id, expenditure_date' }
    )
    .select()
    .single();

  if (expErr) {
    return { error: `Failed to save kitchen expenditure: ${expErr.message}` };
  }

  // 2. Fetch present diners count from attendance
  let presentCount = 0;
  try {
    const attendance = await getAttendanceDay(unit_id, expenditure_date, supabase);
    presentCount = attendance.present_count;
  } catch {
    // If no attendance entered yet, default present count to 0
    presentCount = 0;
  }

  // 3. Compute P_d rate: Total Expenditure / Total Present Count
  const ratePerDiner = presentCount > 0 ? total_amount / presentCount : 0;

  // 4. Upsert mess_daily_p_rates snapshot
  const { error: pErr } = await supabase
    .from('mess_daily_p_rates')
    .upsert(
      {
        unit_id,
        rate_date: expenditure_date,
        total_expenditure: total_amount,
        present_count: presentCount,
        rate_per_diner: Math.round(ratePerDiner * 10000) / 10000,
        calculated_at: new Date().toISOString(),
        calculated_by: user.id,
      },
      { onConflict: 'unit_id, rate_date' }
    );

  if (pErr) {
    return { error: `Expenditure saved, but failed to update P-rate: ${pErr.message}` };
  }

  revalidatePath('/messing');
  revalidatePath('/attendance');
  return { ok: true, data: { total_amount, presentCount, ratePerDiner } };
}

/**
 * Officer or Mess Havildar records a meal cut (e.g. absent for dinner).
 */
export async function recordMealCutAction(input: unknown): Promise<ActionResult> {
  const parsed = mealCutInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid meal cut input', details: parsed.error.flatten() };
  }

  const currentUser = await requireUser();
  const targetProfileId = parsed.data.profile_id ?? currentUser.id;

  // If setting for someone else, require attendance.write
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
        status: 'approved',
        reason: parsed.data.reason ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id, cut_date, meal_type' }
    );

  if (error) {
    return { error: `Failed to place meal cut: ${error.message}` };
  }

  revalidatePath('/messing');
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
    .eq('meal_type', input.meal_type as any);

  if (error) {
    return { error: `Failed to cancel meal cut: ${error.message}` };
  }

  revalidatePath('/messing');
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

  const user = await requireCapability('attendance.write', parsed.data.unit_id);
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

  revalidatePath('/messing');
  return { ok: true };
}
