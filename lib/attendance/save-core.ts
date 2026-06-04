import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { Absentee } from '@/lib/schemas/attendance';

type Sb = SupabaseClient<Database>;
export type CoreResult = { ok: true } | { error: string };

const key = (t: 'profile' | 'dependant', id: string) => `${t}:${id}`;

/** Diff-applies the full absentee set for a (unit, date). Caller must have
 *  already authorised the write. Rejects if the day is finalized. */
export async function applyAttendanceSave(
  supabase: Sb,
  uid: string | null,
  input: { unit_id: string; attendance_date: string; absent: Absentee[] },
): Promise<CoreResult> {
  const { data: day, error: dayErr } = await supabase
    .from('attendance_days')
    .upsert(
      {
        unit_id: input.unit_id,
        attendance_date: input.attendance_date,
        created_by: uid,
        updated_by: uid,
      },
      { onConflict: 'unit_id,attendance_date', ignoreDuplicates: false },
    )
    .select('id, status')
    .single();
  if (dayErr || !day) return { error: dayErr?.message ?? 'Could not open day' };
  if (day.status === 'finalized')
    return { error: 'Attendance is finalized; reopen before editing.' };

  const { data: existingRows, error: exErr } = await supabase
    .from('attendance_absences')
    .select('id, profile_id, dependant_id, reason')
    .eq('day_id', day.id);
  if (exErr) return { error: exErr.message };

  const existing = new Map<string, { id: string; reason: string | null }>();
  for (const r of existingRows ?? []) {
    if (r.profile_id)
      existing.set(key('profile', r.profile_id), { id: r.id, reason: r.reason });
    else if (r.dependant_id)
      existing.set(key('dependant', r.dependant_id), { id: r.id, reason: r.reason });
  }

  const desired = new Map<
    string,
    { person_type: 'profile' | 'dependant'; person_id: string; reason: string | null }
  >();
  for (const a of input.absent) {
    desired.set(key(a.person_type, a.person_id), {
      person_type: a.person_type,
      person_id: a.person_id,
      reason: a.reason ?? null,
    });
  }

  const toDelete: string[] = [];
  for (const [k, v] of existing) if (!desired.has(k)) toDelete.push(v.id);

  const toInsert: Database['public']['Tables']['attendance_absences']['Insert'][] = [];
  const toUpdate: { id: string; reason: string | null }[] = [];
  for (const [k, v] of desired) {
    const ex = existing.get(k);
    if (!ex) {
      toInsert.push({
        day_id: day.id,
        profile_id: v.person_type === 'profile' ? v.person_id : null,
        dependant_id: v.person_type === 'dependant' ? v.person_id : null,
        reason: v.reason,
        created_by: uid,
      });
    } else if ((ex.reason ?? null) !== v.reason) {
      toUpdate.push({ id: ex.id, reason: v.reason });
    }
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('attendance_absences')
      .delete()
      .in('id', toDelete);
    if (error) return { error: error.message };
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from('attendance_absences').insert(toInsert);
    if (error) return { error: error.message };
  }
  for (const u of toUpdate) {
    const { error } = await supabase
      .from('attendance_absences')
      .update({ reason: u.reason })
      .eq('id', u.id);
    if (error) return { error: error.message };
  }

  return { ok: true };
}

export async function applyFinalize(
  supabase: Sb,
  uid: string | null,
  input: { unit_id: string; attendance_date: string },
): Promise<CoreResult> {
  const { data: day, error: upErr } = await supabase
    .from('attendance_days')
    .upsert(
      {
        unit_id: input.unit_id,
        attendance_date: input.attendance_date,
        created_by: uid,
        updated_by: uid,
      },
      { onConflict: 'unit_id,attendance_date', ignoreDuplicates: false },
    )
    .select('id')
    .single();
  if (upErr || !day) return { error: upErr?.message ?? 'Could not open day' };

  const { error } = await supabase
    .from('attendance_days')
    .update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      finalized_by: uid,
      updated_by: uid,
    })
    .eq('id', day.id);
  if (error) return { error: error.message };
  return { ok: true };
}
