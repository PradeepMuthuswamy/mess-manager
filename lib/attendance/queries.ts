import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

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
} from './types';
import type { AttendanceStatus } from '@/lib/schemas/attendance';

type Sb = SupabaseClient<Database>;

type ProfileRow = { id: string; display_name: string | null; full_name: string | null };
type DependantRow = {
  id: string;
  full_name: string;
  relation: 'spouse' | 'child' | 'parent';
  primary_profile_id: string;
};

async function loadRoster(supabase: Sb, unitId: string) {
  const [{ data: profiles, error: pErr }, { data: deps, error: dErr }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, full_name')
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .eq('dining_in', true)
        .order('display_name'),
      supabase
        .from('dependants')
        .select('id, full_name, relation, primary_profile_id')
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .eq('dining_in', true)
        .order('full_name'),
    ]);

  if (pErr) throw new Error(pErr.message);
  if (dErr) throw new Error(dErr.message);

  const profileRows = (profiles ?? []) as ProfileRow[];
  const dependantRows = (deps ?? []) as DependantRow[];

  const sponsorIds = [...new Set(dependantRows.map((d) => d.primary_profile_id))];
  let sponsorName = new Map<string, string>();
  if (sponsorIds.length > 0) {
    const { data: sponsors, error: sErr } = await supabase
      .from('profiles')
      .select('id, display_name, full_name')
      .in('id', sponsorIds);
    if (sErr) throw new Error(sErr.message);
    sponsorName = new Map(
      ((sponsors ?? []) as ProfileRow[]).map((s) => [
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
  client?: Sb,
): Promise<AttendanceDayView> {
  const supabase = client ?? (await createClient());

  const { profileRows, dependantRows, sponsorName } = await loadRoster(
    supabase,
    unitId,
  );

  const { data: day, error: dayErr } = await supabase
    .from('attendance_days')
    .select('id, status')
    .eq('unit_id', unitId)
    .eq('attendance_date', date)
    .maybeSingle();
  if (dayErr) throw new Error(dayErr.message);

  const status: AttendanceStatus = (day?.status as AttendanceStatus) ?? 'draft';

  const absentProfile = new Map<string, string | null>();
  const absentDependant = new Map<string, string | null>();
  if (day) {
    const { data: absences, error: aErr } = await supabase
      .from('attendance_absences')
      .select('profile_id, dependant_id, reason')
      .eq('day_id', day.id);
    if (aErr) throw new Error(aErr.message);
    for (const a of absences ?? []) {
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
  const supabase = await createClient();

  const [{ data: profiles, error: pErr }, { data: deps, error: dErr }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, full_name, dining_in')
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .order('display_name'),
      supabase
        .from('dependants')
        .select('id, full_name, relation, primary_profile_id, dining_in')
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .order('full_name'),
    ]);

  if (pErr) throw new Error(pErr.message);
  if (dErr) throw new Error(dErr.message);

  const out: DiningCandidate[] = [];

  for (const p of (profiles ?? []) as (ProfileRow & { dining_in: boolean })[]) {
    out.push({
      person_type: 'profile',
      person_id: p.id,
      name: p.display_name ?? p.full_name ?? 'Unknown',
      relation: null,
      sponsor_name: null,
      dining_in: p.dining_in,
    });
  }

  const depRows = (deps ?? []) as (DependantRow & { dining_in: boolean })[];
  const sponsorIds = [...new Set(depRows.map((d) => d.primary_profile_id))];
  let sponsorName = new Map<string, string>();
  if (sponsorIds.length > 0) {
    const { data: sponsors, error: sErr } = await supabase
      .from('profiles')
      .select('id, display_name, full_name')
      .in('id', sponsorIds);
    if (sErr) throw new Error(sErr.message);
    sponsorName = new Map(
      ((sponsors ?? []) as ProfileRow[]).map((s) => [
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
      dining_in: d.dining_in,
    });
  }

  return out;
}

function monthBounds(month: string) {
  // month = 'YYYY-MM'
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, lastDay };
}

export async function getMonthlyAttendance(
  unitId: string,
  month: string,
  client?: Sb,
): Promise<MonthlyAttendance> {
  const supabase = client ?? (await createClient());
  const { start, end } = monthBounds(month);

  const { profileRows, dependantRows } = await loadRoster(supabase, unitId);
  const rosterProfiles = new Set(profileRows.map((p) => p.id));
  const rosterDependants = new Set(dependantRows.map((d) => d.id));
  const rosterTotal = rosterProfiles.size + rosterDependants.size;

  const { data: dayRows, error: dErr } = await supabase
    .from('attendance_days')
    .select('id, attendance_date, status')
    .eq('unit_id', unitId)
    .gte('attendance_date', start)
    .lte('attendance_date', end);
  if (dErr) throw new Error(dErr.message);

  const days: MonthlyAttendance['days'] = {};
  const dayIds = (dayRows ?? []).map((d) => d.id);

  const absentByDay = new Map<string, number>();
  if (dayIds.length > 0) {
    const { data: absences, error: aErr } = await supabase
      .from('attendance_absences')
      .select('day_id, profile_id, dependant_id')
      .in('day_id', dayIds);
    if (aErr) throw new Error(aErr.message);
    for (const a of absences ?? []) {
      const inRoster =
        (a.profile_id && rosterProfiles.has(a.profile_id)) ||
        (a.dependant_id && rosterDependants.has(a.dependant_id));
      if (!inRoster) continue;
      absentByDay.set(a.day_id, (absentByDay.get(a.day_id) ?? 0) + 1);
    }
  }

  let sum = 0;
  let recorded = 0;
  for (const d of dayRows ?? []) {
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
