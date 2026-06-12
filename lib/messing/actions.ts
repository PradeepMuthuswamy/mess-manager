'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { requireRole } from '@/lib/auth/require-role';
import { updateUnitFlatRatesSchema } from '@/lib/schemas/messing';
import { format, subDays, parseISO } from 'date-fns';

type ActionResult = { ok: true } | { error: string; details?: unknown };

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
    return { ok: true };
  } catch (err: any) {
    return { error: err?.message || 'An unexpected error occurred.' };
  }
}
