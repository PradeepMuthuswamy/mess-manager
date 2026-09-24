import 'server-only';
import { getDb } from '@/lib/mongo';

export type {
  RosterMember,
  AttendanceMember,
  AttendanceDayView,
  DiningCandidate,
  MonthlyAttendance,
} from './types';
import type {
  AttendanceMember,
  AttendanceDayView,
  DiningCandidate,
  MonthlyAttendance,
  AttendanceDay,
  AttendanceAbsence,
} from './types';
import type { AttendanceStatus } from '@/lib/schemas/attendance';

type ProfileRow = { id: string; display_name: string | null; full_name: string | null };
type DependantRow = {
  id: string;
  full_name: string;
  relation: 'spouse' | 'child' | 'parent';
  primary_profile_id: string;
};

async function loadRoster(unitId: string) {
  const db = await getDb();
  const [profiles, deps] = await Promise.all([
    db
      .collection('profiles')
      .find({ unit_id: unitId, is_active: true, dining_in: true })
      .sort({ display_name: 1 })
      .toArray(),
    db
      .collection('dependants')
      .find({ unit_id: unitId, is_active: true, dining_in: true })
      .sort({ full_name: 1 })
      .toArray(),
  ]);

  const profileRows = profiles as unknown as ProfileRow[];
  const dependantRows = deps as unknown as DependantRow[];

  const sponsorIds = [...new Set(dependantRows.map((d) => d.primary_profile_id).filter(Boolean))];
  let sponsorName = new Map<string, string>();
  if (sponsorIds.length > 0) {
    const sponsors = (await db
      .collection('profiles')
      .find({ id: { $in: sponsorIds } })
      .toArray()) as unknown as ProfileRow[];
    sponsorName = new Map(
      sponsors.map((s) => [
        s.id,
        s.display_name ?? s.full_name ?? 'Unknown',
      ]),
    );
  }

  return { profileRows, dependantRows, sponsorName };
}

export async function getAttendanceDay(
  unitId: string,
  date: string,
  _client?: unknown,
): Promise<AttendanceDayView> {
  const db = await getDb();

  const { profileRows, dependantRows, sponsorName } = await loadRoster(unitId);

  const day = (await db.collection<AttendanceDay>('attendance_days').findOne({
    unit_id: unitId,
    attendance_date: date,
  })) as AttendanceDay | null;

  const status: AttendanceStatus = (day?.status as AttendanceStatus) ?? 'draft';

  const absentProfile = new Map<string, string | null>();
  const absentDependant = new Map<string, string | null>();
  if (day) {
    const absences = (await db
      .collection<AttendanceAbsence>('attendance_absences')
      .find({ day_id: day.id })
      .toArray()) as AttendanceAbsence[];
    for (const a of absences) {
      if (a.profile_id) absentProfile.set(a.profile_id, a.reason ?? null);
      else if (a.dependant_id) absentDependant.set(a.dependant_id, a.reason ?? null);
    }
  }

  const members: AttendanceMember[] = [];

  for (const p of profileRows) {
    const absent = absentProfile.has(p.id);
    members.push({
      person_type: 'profile',
      person_id: p.id,
      name: p.display_name ?? p.full_name ?? 'Unknown',
      relation: null,
      sponsor_name: null,
      present: !absent,
      reason: absent ? absentProfile.get(p.id) ?? null : null,
    });
  }

  for (const d of dependantRows) {
    const absent = absentDependant.has(d.id);
    members.push({
      person_type: 'dependant',
      person_id: d.id,
      name: d.full_name,
      relation: d.relation,
      sponsor_name: sponsorName.get(d.primary_profile_id) ?? null,
      present: !absent,
      reason: absent ? absentDependant.get(d.id) ?? null : null,
    });
  }

  const present_count = members.filter((m) => m.present).length;

  return {
    unit_id: unitId,
    date,
    status,
    members,
    present_count,
    total: members.length,
  };
}

export async function listDiningCandidates(
  unitId: string,
): Promise<DiningCandidate[]> {
  const db = await getDb();

  const [profiles, deps] = await Promise.all([
    db
      .collection('profiles')
      .find({ unit_id: unitId, is_active: true })
      .sort({ display_name: 1 })
      .toArray(),
    db
      .collection('dependants')
      .find({ unit_id: unitId, is_active: true })
      .sort({ full_name: 1 })
      .toArray(),
  ]);

  const out: DiningCandidate[] = [];

  for (const p of profiles as Record<string, unknown>[]) {
    out.push({
      person_type: 'profile',
      person_id: p.id,
      name: p.display_name ?? p.full_name ?? 'Unknown',
      relation: null,
      sponsor_name: null,
      dining_in: Boolean(p.dining_in),
    });
  }

  const depRows = deps as Record<string, unknown>[];
  const sponsorIds = [...new Set(depRows.map((d) => d.primary_profile_id).filter(Boolean))];
  let sponsorName = new Map<string, string>();
  if (sponsorIds.length > 0) {
    const sponsors = (await db
      .collection('profiles')
      .find({ id: { $in: sponsorIds } })
      .toArray()) as Record<string, unknown>[];
    sponsorName = new Map(
      sponsors.map((s) => [
        s.id,
        s.display_name ?? s.full_name ?? 'Unknown',
      ]),
    );
  }

  for (const d of depRows) {
    out.push({
      person_type: 'dependant',
      person_id: d.id,
      name: d.full_name,
      relation: d.relation,
      sponsor_name: sponsorName.get(d.primary_profile_id) ?? null,
      dining_in: Boolean(d.dining_in),
    });
  }

  return out;
}

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, lastDay };
}

export async function getMonthlyAttendance(
  unitId: string,
  month: string,
  _client?: unknown,
): Promise<MonthlyAttendance> {
  const db = await getDb();
  const { start, end } = monthBounds(month);

  const { profileRows, dependantRows } = await loadRoster(unitId);
  const rosterProfiles = new Set(profileRows.map((p) => p.id));
  const rosterDependants = new Set(dependantRows.map((d) => d.id));
  const rosterTotal = rosterProfiles.size + rosterDependants.size;

  const dayRows = (await db
    .collection<AttendanceDay>('attendance_days')
    .find({
      unit_id: unitId,
      attendance_date: { $gte: start, $lte: end },
    })
    .toArray()) as AttendanceDay[];

  const days: MonthlyAttendance['days'] = {};
  const dayIds = dayRows.map((d) => d.id);

  const absentByDay = new Map<string, number>();
  if (dayIds.length > 0) {
    const absences = (await db
      .collection<AttendanceAbsence>('attendance_absences')
      .find({ day_id: { $in: dayIds } })
      .toArray()) as AttendanceAbsence[];
    for (const a of absences) {
      const inRoster =
        (a.profile_id && rosterProfiles.has(a.profile_id)) ||
        (a.dependant_id && rosterDependants.has(a.dependant_id));
      if (!inRoster) continue;
      absentByDay.set(a.day_id, (absentByDay.get(a.day_id) ?? 0) + 1);
    }
  }

  let sum = 0;
  let recorded = 0;
  for (const d of dayRows) {
    const present = Math.max(0, rosterTotal - (absentByDay.get(d.id) ?? 0));
    days[d.attendance_date] = {
      date: d.attendance_date,
      present_count: present,
      status: d.status,
    };
    sum += present;
    recorded += 1;
  }

  return {
    month,
    roster_total: rosterTotal,
    days,
    recorded_days: recorded,
    average_present: recorded > 0 ? Math.round((sum / recorded) * 10) / 10 : null,
  };
}
