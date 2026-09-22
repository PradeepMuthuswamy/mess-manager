'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireRole, requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';

const BILL_FORMAT_TEMPLATES = ['classic', 'compact', 'formal'] as const;

const updateUnitBillTemplateSchema = z.object({
  unit_id: z.string().uuid(),
  bill_format_template: z.enum(BILL_FORMAT_TEMPLATES),
  room_bill_format_template: z.enum(BILL_FORMAT_TEMPLATES),
});

type ActionResult = { ok: true } | { error: string; details?: unknown };

type BillFormatTemplate = (typeof BILL_FORMAT_TEMPLATES)[number];

type UnitsTemplateUpdate = {
  update: (values: {
    bill_format_template: BillFormatTemplate;
    room_bill_format_template: BillFormatTemplate;
  }) => {
    eq: (
      column: 'id',
      value: string,
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

/**
 * Sets the mess-bill and room-bill print templates for a unit.
 */
export async function updateUnitBillTemplateAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateUnitBillTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid bill template input', details: parsed.error.flatten() };
  }

  const { unit_id, bill_format_template, room_bill_format_template } = parsed.data;
  const user = await requireUser();
  if (userHasCapability(user, 'billing.finalize', unit_id)) {
    await requireCapability('billing.finalize', unit_id);
  } else {
    await requireRole(['unit_admin', 'super_admin']);
  }

  if (user.role !== 'super_admin' && user.homeUnitId !== unit_id) {
    return { error: 'You can only update bill templates for your own unit.' };
  }

  // units_write_admin RLS is super_admin-only; service role is the only way
  // unit_admin / billing.finalize holders can persist these columns.
  const supabase = createServiceClient();
  const { error } = await (
    supabase.from('units') as unknown as UnitsTemplateUpdate
  )
    .update({ bill_format_template, room_bill_format_template })
    .eq('id', unit_id);

  if (error) {
    return { error: `Failed to update bill templates: ${error.message}` };
  }

  revalidatePath('/settings');
  revalidatePath('/billing');
  return { ok: true };
}
