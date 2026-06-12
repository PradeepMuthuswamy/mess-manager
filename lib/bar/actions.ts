'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { createBarChitSchema, type CreateBarChitInput } from '@/lib/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

type ActionResult = {
  ok?: boolean;
  error?: string;
  id?: string;
};

/**
 * Core business logic for creating a bar chit and depletions.
 * Shared between Server Action and REST API.
 */
export async function createBarChitCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: CreateBarChitInput
): Promise<ActionResult> {
  const { unit_id, date, consumer_type, profile_id, guest_name, booking_id, items } = data;

  if (consumer_type === 'member' && !profile_id) {
    return { error: 'Profile is required for members' };
  }
  if (consumer_type === 'guest' && !guest_name) {
    return { error: 'Guest name is required for guests' };
  }

  // Normalize peg quantities/rates to bottle units
  const normalizedItems = [];
  for (const item of items) {
    let quantity = item.quantity;
    let rate = item.rate;

    if (item.unit === 'peg') {
      const { data: variant, error: varErr } = await supabase
        .from('product_variants')
        .select('unit_value, unit_type, package_type')
        .eq('id', item.variant_id)
        .single();

      if (varErr || !variant) {
        return { error: `Failed to retrieve details for ${item.name}: ${varErr?.message ?? 'Not found'}` };
      }

      const unitValue = Number(variant.unit_value);
      let volumeMl = 0;
      if (variant.unit_type === 'ML') {
        volumeMl = unitValue;
      } else if (variant.unit_type === 'LITRE') {
        volumeMl = unitValue * 1000;
      } else if (variant.unit_type === 'PIECE' && variant.package_type === 'BOTTLE') {
        volumeMl = 750; // default standard bottle volume (25 pegs)
      }

      if (volumeMl <= 0) {
        return { error: `Cannot use peg unit for non-liquid item ${item.name}` };
      }

      const pegsPerBottle = volumeMl / 30;
      quantity = item.quantity / pegsPerBottle;
      rate = item.rate * pegsPerBottle;
    }

    normalizedItems.push({
      ...item,
      quantity,
      rate,
    });
  }

  // 1. Validate stock availability for each item first (FIFO check)
  for (const item of normalizedItems) {
    const { data: lots, error: lotsErr } = await supabase
      .from('unit_inventory')
      .select('qty_packs')
      .eq('unit_id', unit_id)
      .eq('variant_id', item.variant_id)
      .eq('is_active', true)
      .gt('qty_packs', 0);

    if (lotsErr) {
      return { error: `Database error checking stock for ${item.name}: ${lotsErr.message}` };
    }

    const totalAvailable = (lots ?? []).reduce((sum, lot) => sum + Number(lot.qty_packs), 0);
    // Allow slight floating point tolerance on stock checks
    if (totalAvailable + 0.0001 < item.quantity) {
      return { error: `Insufficient stock for ${item.name}. Requested: ${item.quantity.toFixed(3)} bottles, Available: ${totalAvailable.toFixed(3)} bottles` };
    }
  }

  // 2. Calculate total amount
  const total_amount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.rate, 0);

  // 3. Create the chit header
  const { data: chit, error: chitErr } = await supabase
    .from('bar_chits')
    .insert({
      unit_id,
      date,
      profile_id: consumer_type === 'member' ? profile_id : null,
      guest_name: consumer_type === 'guest' ? guest_name : null,
      booking_id: consumer_type === 'guest' ? booking_id : null,
      total_amount,
      status: 'pending',
      created_by: userId,
    })
    .select('id')
    .single();

  if (chitErr || !chit) {
    return { error: `Failed to create bar chit: ${chitErr?.message}` };
  }

  const chitId = chit.id;

  // 4. Insert chit items and deplete inventory
  for (const item of normalizedItems) {
    // A. Insert bar_chit_item
    const itemAmount = item.quantity * item.rate;
    const { error: lineErr } = await supabase
      .from('bar_chit_items')
      .insert({
        chit_id: chitId,
        variant_id: item.variant_id,
        quantity: item.quantity,
        rate: item.rate,
        amount: itemAmount,
      });

    if (lineErr) {
      // Clean up header in case of failure (transaction fallback)
      await supabase.from('bar_chits').delete().eq('id', chitId);
      return { error: `Failed to insert line item for ${item.name}: ${lineErr.message}` };
    }

    // B. Deplete inventory lots (FIFO)
    let remainingToDeplete = item.quantity;

    // Fetch lots sorted by acquired_on ascending (or created_at if null) to ensure FIFO
    const { data: lots, error: fetchLotsErr } = await supabase
      .from('unit_inventory')
      .select('id, qty_packs')
      .eq('unit_id', unit_id)
      .eq('variant_id', item.variant_id)
      .eq('is_active', true)
      .gt('qty_packs', 0)
      .order('acquired_on', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (fetchLotsErr || !lots) {
      await supabase.from('bar_chits').delete().eq('id', chitId);
      return { error: `Failed to retrieve inventory lots for depletion: ${fetchLotsErr?.message}` };
    }

    // Prioritize depletion of the explicitly selected lot
    if ((item as any).lot_id) {
      lots.sort((a, b) => {
        if (a.id === (item as any).lot_id) return -1;
        if (b.id === (item as any).lot_id) return 1;
        return 0;
      });
    }

    for (const lot of lots) {
      if (remainingToDeplete <= 0.0001) break;

      const currentLotQty = Number(lot.qty_packs);

      if (currentLotQty <= remainingToDeplete + 0.0001) {
        // Fully deplete this lot (subtract remainingToDeplete, but round off if within tolerance)
        remainingToDeplete = Math.max(0, remainingToDeplete - currentLotQty);
        
        // Deactivate lot
        const { error: updateLotErr } = await supabase
          .from('unit_inventory')
          .update({
            qty_packs: 0,
            is_active: false,
          })
          .eq('id', lot.id);

        if (updateLotErr) {
          await supabase.from('bar_chits').delete().eq('id', chitId);
          return { error: `Failed to update inventory lot ${lot.id}: ${updateLotErr.message}` };
        }
      } else {
        // Partially deplete this lot
        const newLotQty = currentLotQty - remainingToDeplete;
        remainingToDeplete = 0;

        const { error: updateLotErr } = await supabase
          .from('unit_inventory')
          .update({
            qty_packs: newLotQty,
          })
          .eq('id', lot.id);

        if (updateLotErr) {
          await supabase.from('bar_chits').delete().eq('id', chitId);
          return { error: `Failed to update inventory lot ${lot.id}: ${updateLotErr.message}` };
        }
      }
    }
  }

  return { ok: true, id: chitId };
}

export async function createBarChitAction(
  _prev: unknown,
  payload: unknown,
): Promise<ActionResult> {
  // 1. Authenticate user
  const user = await requireUser();
  
  // 2. Validate input payload
  const parsed = createBarChitSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: 'Invalid input data: ' + parsed.error.issues.map(i => i.message).join(', ') };
  }

  const { unit_id } = parsed.data;

  // 3. Verify user capability
  await requireCapability('bar.write', unit_id);

  const supabase = await createClient();

  // 4. Run core logic
  const res = await createBarChitCore(supabase, user.id, parsed.data);

  if (res.ok) {
    // 5. Revalidate paths
    revalidatePath('/bar');
    revalidatePath('/inventory');
  }

  return res;
}
