import 'server-only';
import { getDb } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import type { Absentee } from '@/lib/schemas/attendance';
import type { AttendanceDay, AttendanceAbsence } from './types';

export type CoreResult = { ok: true } | { error: string };

const key = (t: 'profile' | 'dependant', id: string) => `${t}:${id}`;

/** Diff-applies the full absentee set for a (unit, date). Caller must have
 *  already authorised the write. Rejects if the day is finalized. */
export async function applyAttendanceSave(
  arg1: unknown,
  arg2: unknown,
  arg3?: unknown,
): Promise<CoreResult> {
  const uid: string | null = arg3 !== undefined ? (arg2 as string) : (arg1 as string);
  const input: { unit_id: string; attendance_date: string; absent: Absentee[] } =
    arg3 !== undefined ? (arg3 as never) : (arg2 as never);

  const db = await getDb();
  const daysCol = db.collection<AttendanceDay>('attendance_days');
  const absencesCol = db.collection<AttendanceAbsence>('attendance_absences');

  const day = await daysCol.findOne({
    unit_id: input.unit_id,
    attendance_date: input.attendance_date,
  });

  const now = new Date().toISOString();
  let dayId: string;

  if (day) {
    if (day.status === 'finalized') {
      return { error: 'Attendance is finalized; reopen before editing.' };
    }
    dayId = day.id;
  } else {
    dayId = crypto.randomUUID();
    const newDay: AttendanceDay = {
      id: dayId,
      unit_id: input.unit_id,
      attendance_date: input.attendance_date,
      status: 'draft',
      created_at: now,
      updated_at: now,
      created_by: uid,
      updated_by: uid,
    };
    await daysCol.insertOne(newDay as Record<string, unknown>);
    await writeAudit({
      table_name: 'attendance_days',
      row_pk: dayId,
      op: 'INSERT',
      active_unit_id: input.unit_id,
      changed_by: uid,
      new_data: newDay as unknown,
    });
  }

  const existingRows = await absencesCol.find({ day_id: dayId }).toArray();
  const existing = new Map<string, { id: string; reason: string | null }>();
  for (const r of existingRows) {
    if (r.profile_id)
      existing.set(key('profile', r.profile_id), { id: r.id, reason: r.reason ?? null });
    else if (r.dependant_id)
      existing.set(key('dependant', r.dependant_id), { id: r.id, reason: r.reason ?? null });
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

  const toDelete: { id: string; row: AttendanceAbsence }[] = [];
  for (const [k, v] of existing) {
    if (!desired.has(k)) {
      const match = existingRows.find((r) => r.id === v.id);
      if (match) toDelete.push({ id: v.id, row: match });
    }
  }

  const toInsert: AttendanceAbsence[] = [];
  const toUpdate: { id: string; reason: string | null; oldReason: string | null }[] = [];
  for (const [k, v] of desired) {
    const ex = existing.get(k);
    if (!ex) {
      toInsert.push({
        id: crypto.randomUUID(),
        day_id: dayId,
        profile_id: v.person_type === 'profile' ? v.person_id : null,
        dependant_id: v.person_type === 'dependant' ? v.person_id : null,
        reason: v.reason,
        created_at: now,
        created_by: uid,
      });
    } else if ((ex.reason ?? null) !== v.reason) {
      toUpdate.push({ id: ex.id, reason: v.reason, oldReason: ex.reason });
    }
  }

  if (toDelete.length > 0) {
    const deleteIds = toDelete.map((d) => d.id);
    await absencesCol.deleteMany({ id: { $in: deleteIds } });
    for (const d of toDelete) {
      await writeAudit({
        table_name: 'attendance_absences',
        row_pk: d.id,
        op: 'DELETE',
        active_unit_id: input.unit_id,
        changed_by: uid,
        old_data: d.row as unknown,
      });
    }
  }

  if (toInsert.length > 0) {
    await absencesCol.insertMany(toInsert as Record<string, unknown>);
    for (const item of toInsert) {
      await writeAudit({
        table_name: 'attendance_absences',
        row_pk: item.id,
        op: 'INSERT',
        active_unit_id: input.unit_id,
        changed_by: uid,
        new_data: item as unknown,
      });
    }
  }

  for (const u of toUpdate) {
    await absencesCol.updateOne(
      { id: u.id },
      { $set: { reason: u.reason } }
    );
    await writeAudit({
      table_name: 'attendance_absences',
      row_pk: u.id,
      op: 'UPDATE',
      active_unit_id: input.unit_id,
      changed_by: uid,
      old_data: { reason: u.oldReason },
      new_data: { reason: u.reason },
    });
  }

  return { ok: true };
}

export async function applyFinalize(
  arg1: unknown,
  arg2: unknown,
  arg3?: unknown,
): Promise<CoreResult> {
  const uid: string | null = arg3 !== undefined ? (arg2 as string) : (arg1 as string);
  const input: { unit_id: string; attendance_date: string } =
    arg3 !== undefined ? (arg3 as never) : (arg2 as never);

  const db = await getDb();
  const daysCol = db.collection<AttendanceDay>('attendance_days');
  const now = new Date().toISOString();

  const existing = await daysCol.findOne({
    unit_id: input.unit_id,
    attendance_date: input.attendance_date,
  });

  if (existing) {
    const patch = {
      status: 'finalized' as const,
      finalized_at: now,
      finalized_by: uid,
      updated_by: uid,
      updated_at: now,
    };
    await daysCol.updateOne({ id: existing.id }, { $set: patch });
    await writeAudit({
      table_name: 'attendance_days',
      row_pk: existing.id,
      op: 'UPDATE',
      active_unit_id: input.unit_id,
      changed_by: uid,
      old_data: { status: existing.status, finalized_at: existing.finalized_at },
      new_data: patch,
    });
  } else {
    const newDayId = crypto.randomUUID();
    const newDay: AttendanceDay = {
      id: newDayId,
      unit_id: input.unit_id,
      attendance_date: input.attendance_date,
      status: 'finalized',
      finalized_at: now,
      finalized_by: uid,
      created_at: now,
      updated_at: now,
      created_by: uid,
      updated_by: uid,
    };
    await daysCol.insertOne(newDay as Record<string, unknown>);
    await writeAudit({
      table_name: 'attendance_days',
      row_pk: newDayId,
      op: 'INSERT',
      active_unit_id: input.unit_id,
      changed_by: uid,
      new_data: newDay as unknown,
    });
  }

  return { ok: true };
}
