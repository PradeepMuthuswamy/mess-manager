'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireRole } from '@/lib/auth/require-role';
import {
  saveAttendanceSchema,
  finalizeAttendanceSchema,
  setUnitConfigSchema,
  setDiningInSchema,
} from '@/lib/schemas/attendance';
import { applyAttendanceSave, applyFinalize } from './save-core';

const ATTENDANCE_PATH = '/attendance';

type ActionResult = { ok: true } | { error: string; details?: unknown };

async function authUid(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function saveAttendanceAction(input: unknown): Promise<ActionResult> {
  const parsed = saveAttendanceSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'Invalid input', details: parsed.error.flatten() };

  const { unit_id } = parsed.data;
  await requireCapability('attendance.write', unit_id);

  const supabase = await createClient();
  const uid = await authUid();

  const res = await applyAttendanceSave(supabase, uid, parsed.data);
  if ('error' in res) return res;

  revalidatePath(ATTENDANCE_PATH);
  return { ok: true };
}

export async function finalizeAttendanceAction(input: unknown): Promise<ActionResult> {
  const parsed = finalizeAttendanceSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'Invalid input', details: parsed.error.flatten() };

  const { unit_id } = parsed.data;
  await requireCapability('attendance.finalize', unit_id);

  const supabase = await createClient();
  const uid = await authUid();

  const res = await applyFinalize(supabase, uid, parsed.data);
  if ('error' in res) return res;

  revalidatePath(ATTENDANCE_PATH);
  return { ok: true };
}

export async function reopenAttendanceAction(input: unknown): Promise<ActionResult> {
  const parsed = finalizeAttendanceSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'Invalid input', details: parsed.error.flatten() };

  const { unit_id, attendance_date } = parsed.data;
  await requireCapability('attendance.finalize', unit_id);

  const supabase = await createClient();
  const uid = await authUid();

  const { error } = await supabase
    .from('attendance_days')
    .update({
      status: 'draft',
      finalized_at: null,
      finalized_by: null,
      updated_by: uid,
    })
    .eq('unit_id', unit_id)
    .eq('attendance_date', attendance_date);
  if (error) return { error: error.message };

  revalidatePath(ATTENDANCE_PATH);
  return { ok: true };
}

export async function setDiningInAction(input: unknown): Promise<ActionResult> {
  const parsed = setDiningInSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'Invalid input', details: parsed.error.flatten() };

  const { person_type, person_id, dining_in } = parsed.data;
  const table = person_type === 'profile' ? 'profiles' : 'dependants';

  const supabase = await createClient();
  const { data: peek, error: peekErr } = await supabase
    .from(table)
    .select('unit_id')
    .eq('id', person_id)
    .maybeSingle();
  if (peekErr) return { error: peekErr.message };
  if (!peek?.unit_id) return { error: 'Person not found' };

  await requireCapability('attendance.write', peek.unit_id);

  const { error } = await supabase
    .from(table)
    .update({ dining_in })
    .eq('id', person_id);
  if (error) return { error: error.message };

  revalidatePath(ATTENDANCE_PATH);
  return { ok: true };
}

export async function setUnitConfigAction(input: unknown): Promise<ActionResult> {
  const parsed = setUnitConfigSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'Invalid input', details: parsed.error.flatten() };

  const { unit_id, mess_type, terrain, messing_billing_mode } = parsed.data;
  const user = await requireRole(['super_admin', 'unit_admin']);
  if (user.role !== 'super_admin' && user.homeUnitId !== unit_id) {
    return { error: 'You can only configure your own unit.' };
  }

  const patch: {
    mess_type?: typeof mess_type;
    terrain?: typeof terrain;
    messing_billing_mode?: Exclude<typeof messing_billing_mode, null>;
  } = {};
  if (mess_type !== undefined) patch.mess_type = mess_type;
  if (terrain !== undefined) patch.terrain = terrain;
  if (messing_billing_mode !== undefined && messing_billing_mode !== null) {
    patch.messing_billing_mode = messing_billing_mode;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('units')
    .update(patch)
    .eq('id', unit_id);
  if (error) return { error: error.message };

  revalidatePath('/settings');
  revalidatePath('/admin/units');
  revalidatePath('/ration');
  return { ok: true };
}
