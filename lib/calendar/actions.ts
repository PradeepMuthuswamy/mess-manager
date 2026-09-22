'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole, requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { userHasCapability } from '@/lib/auth/capabilities';
import type { AuthUser, Role } from '@/lib/auth/types';
import { z } from 'zod';
import {
  createEventSchema,
  importRowSchema,
  publishSchema,
  type EventType,
} from '@/lib/schemas/calendar';

type ActionResult = { ok: true } | { error: string };
type ImportResult = { inserted: number; skipped: number } | { error: string };
type GenerateResult =
  | { ok: true; inserted: number; skipped: number }
  | { error: string };

const UNIQUE_VIOLATION = '23505';
const DUPLICATE_EVENT_MESSAGE =
  'This event is already on the calendar for that date and member.';

const CALENDAR_WRITE_ROLES: Role[] = ['unit_admin', 'mess_secretary', 'super_admin'];

type PgErr = { code?: string; message: string };

type CalendarEventInsert = {
  unit_id: string;
  event_date: string;
  end_date?: string | null;
  event_type: EventType;
  title: string;
  description?: string | null;
  profile_id?: string | null;
  party_id?: string | null;
  is_recurring?: boolean;
  created_by?: string | null;
};

type CalendarPublishInsert = {
  unit_id: string;
  year: number;
  month: number;
  published_by: string;
  published_at: string;
};

type UnitMember = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  service_no: string | null;
  date_of_birth: string | null;
  marriage_date: string | null;
};

type CalendarDb = {
  from(relation: 'social_calendar_events'): {
    insert(values: CalendarEventInsert): PromiseLike<{ error: PgErr | null }>;
  };
  from(relation: 'social_calendar_publishes'): {
    upsert(
      values: CalendarPublishInsert,
      options: { onConflict: string },
    ): PromiseLike<{ error: PgErr | null }>;
  };
  from(relation: 'profiles'): {
    select(columns: string): ProfileFilter;
  };
};

type ProfileFilter = {
  eq(column: string, value: string | boolean): ProfileFilter;
  then: PromiseLike<{ data: UnitMember[] | null; error: PgErr | null }>['then'];
};

function isUserUnit(user: AuthUser, unitId: string) {
  return unitId === user.homeUnitId || unitId === user.activeUnitId;
}

function revalidateCalendar() {
  revalidatePath('/calendar');
  revalidatePath('/dashboard');
}

function calendarDb(supabase: Awaited<ReturnType<typeof createClient>>): CalendarDb {
  // Tables/columns land in 20260910150000; generated Database types may lag.
  return supabase as unknown as CalendarDb;
}

async function requireCalendarWrite(
  unitId: string,
): Promise<{ ok: true; user: AuthUser } | { error: string }> {
  const user = await requireUser();
  if (!isUserUnit(user, unitId)) {
    return { error: 'You cannot manage the calendar for another unit.' };
  }
  if (
    !CALENDAR_WRITE_ROLES.includes(user.role) &&
    !userHasCapability(user, 'parties.write', unitId)
  ) {
    await requireCapability('parties.write', unitId);
  }
  return { ok: true, user };
}

async function listUnitMembers(
  db: CalendarDb,
  unitId: string,
): Promise<{ data: UnitMember[] } | { error: string }> {
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, display_name, email, service_no, date_of_birth, marriage_date')
    .eq('unit_id', unitId)
    .eq('is_active', true);

  if (error) return { error: error.message };
  return { data: data ?? [] };
}

function memberLabel(member: Pick<UnitMember, 'display_name' | 'full_name'>): string {
  return member.display_name?.trim() || member.full_name?.trim() || 'Member';
}

function resolveMemberId(members: UnitMember[], member: string | null | undefined): string | null {
  if (!member) return null;
  const needle = member.trim().toLowerCase();
  if (!needle) return null;
  const match = members.find(
    (row) =>
      row.email?.toLowerCase() === needle || row.service_no?.trim().toLowerCase() === needle,
  );
  return match?.id ?? null;
}

function isGregorianLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function occurrenceInYear(isoDate: string, year: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const month = match[2];
  let day = match[3];
  if (month === '02' && day === '29' && !isGregorianLeap(year)) {
    day = '28';
  }
  return `${year}-${month}-${day}`;
}

async function insertCalendarEvent(
  db: CalendarDb,
  row: CalendarEventInsert,
): Promise<'inserted' | 'duplicate' | { error: string }> {
  const { error } = await db.from('social_calendar_events').insert(row);
  if (!error) return 'inserted';
  if (error.code === UNIQUE_VIOLATION) return 'duplicate';
  return { error: error.message };
}

export async function createCalendarEventAction(input: unknown): Promise<ActionResult> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) return { error: 'Check the event date, type, and title.' };

  const gate = await requireCalendarWrite(parsed.data.unit_id);
  if ('error' in gate) return gate;

  const result = await insertCalendarEvent(calendarDb(await createClient()), {
    unit_id: parsed.data.unit_id,
    event_date: parsed.data.event_date,
    end_date: parsed.data.end_date ?? null,
    event_type: parsed.data.event_type,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    profile_id: parsed.data.profile_id ?? null,
    party_id: parsed.data.party_id ?? null,
    is_recurring: parsed.data.is_recurring,
    created_by: gate.user.id,
  });

  if (result === 'duplicate') return { error: DUPLICATE_EVENT_MESSAGE };
  if (result !== 'inserted') return result;

  revalidateCalendar();
  return { ok: true };
}

export async function importCalendarEventsAction(
  unitId: string,
  rows: unknown[],
): Promise<ImportResult> {
  const unitParsed = z.string().uuid().safeParse(unitId);
  if (!unitParsed.success) return { error: 'Invalid unit.' };

  const gate = await requireCalendarWrite(unitParsed.data);
  if ('error' in gate) return gate;

  const db = calendarDb(await createClient());
  const members = await listUnitMembers(db, unitParsed.data);
  if ('error' in members) return { error: members.error };

  let inserted = 0;
  let skipped = 0;

  for (const raw of rows) {
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }

    const memberKey = parsed.data.member?.trim() ?? '';
    const profileId = resolveMemberId(members.data, parsed.data.member);
    if (memberKey && !profileId) {
      skipped += 1;
      continue;
    }

    const result = await insertCalendarEvent(db, {
      unit_id: unitParsed.data,
      event_date: parsed.data.date,
      event_type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.notes ?? null,
      profile_id: profileId,
      is_recurring: false,
      created_by: gate.user.id,
    });

    if (result === 'inserted') inserted += 1;
    else if (result === 'duplicate') skipped += 1;
    else return result;
  }

  if (inserted > 0) revalidateCalendar();
  return { inserted, skipped };
}

export async function generateRecurringEventsAction(
  unitId: string,
  year: number,
): Promise<GenerateResult> {
  const parsed = publishSchema.pick({ unit_id: true, year: true }).safeParse({
    unit_id: unitId,
    year,
  });
  if (!parsed.success) return { error: 'Check the unit and year.' };

  const gate = await requireCalendarWrite(parsed.data.unit_id);
  if ('error' in gate) return gate;

  const db = calendarDb(await createClient());
  const members = await listUnitMembers(db, parsed.data.unit_id);
  if ('error' in members) return { error: members.error };

  let inserted = 0;
  let skipped = 0;

  for (const member of members.data) {
    const candidates: Array<{ source: string | null; event_type: EventType; title: string }> = [
      {
        source: member.date_of_birth,
        event_type: 'birthday',
        title: `${memberLabel(member)}'s birthday`,
      },
      {
        source: member.marriage_date,
        event_type: 'anniversary',
        title: `${memberLabel(member)}'s anniversary`,
      },
    ];

    for (const candidate of candidates) {
      if (!candidate.source) continue;
      const eventDate = occurrenceInYear(candidate.source, parsed.data.year);
      if (!eventDate || eventDate < candidate.source) continue;

      const result = await insertCalendarEvent(db, {
        unit_id: parsed.data.unit_id,
        event_date: eventDate,
        event_type: candidate.event_type,
        title: candidate.title,
        profile_id: member.id,
        is_recurring: true,
        created_by: gate.user.id,
      });

      if (result === 'inserted') inserted += 1;
      else if (result === 'duplicate') skipped += 1;
      else return result;
    }
  }

  if (inserted > 0) revalidateCalendar();
  return { ok: true, inserted, skipped };
}

export async function publishCalendarMonthAction(
  unitId: string,
  year: number,
  month: number,
): Promise<ActionResult> {
  const parsed = publishSchema.safeParse({ unit_id: unitId, year, month });
  if (!parsed.success) return { error: 'Check the year and month.' };

  const user = await requireRole(['unit_admin', 'mess_secretary']);
  if (!isUserUnit(user, parsed.data.unit_id)) {
    return { error: 'You cannot publish another unit’s calendar.' };
  }

  const db = calendarDb(await createClient());
  const { error } = await db.from('social_calendar_publishes').upsert(
    {
      unit_id: parsed.data.unit_id,
      year: parsed.data.year,
      month: parsed.data.month,
      published_by: user.id,
      published_at: new Date().toISOString(),
    },
    { onConflict: 'unit_id,year,month' },
  );

  if (error) return { error: error.message };

  // lib/email/resend has no generic send; skip the optional summary email (REQ-SOC-11).
  revalidateCalendar();
  return { ok: true };
}
