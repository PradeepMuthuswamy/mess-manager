import 'server-only';
import { getDb } from '@/lib/mongo';
import type { CalendarPublish, SocialCalendarEvent } from './types';

type RawEventDoc = {
  id?: unknown;
  unit_id?: unknown;
  event_date?: unknown;
  end_date?: string | null;
  event_type?: unknown;
  title?: unknown;
  description?: string | null;
  profile_id?: string | null;
  party_id?: string | null;
  is_recurring?: unknown;
  created_at?: unknown;
  created_by?: string | null;
};

function mapEvent(doc: any): SocialCalendarEvent {
  return {
    id: String(doc.id),
    unit_id: String(doc.unit_id),
    event_date: String(doc.event_date),
    end_date: doc.end_date ?? null,
    event_type: doc.event_type as SocialCalendarEvent['event_type'],
    title: String(doc.title),
    description: doc.description ?? null,
    profile_id: doc.profile_id ?? null,
    party_id: doc.party_id ?? null,
    is_recurring: Boolean(doc.is_recurring),
    created_at: String(doc.created_at),
    created_by: doc.created_by ?? null,
  };
}

export async function listCalendarEvents(
  unitId: string,
  from: string,
  to: string,
): Promise<SocialCalendarEvent[]> {
  const db = await getDb();
  const docs = await db
    .collection('social_calendar_events')
    .find({
      unit_id: unitId,
      event_date: { $lte: to },
      $or: [
        { end_date: { $gte: from } },
        { event_date: { $gte: from } },
      ],
    })
    .sort({ event_date: 1, title: 1 })
    .toArray();

  return docs.map(mapEvent);
}

export async function listUpcomingCalendarEvents(
  unitId: string,
  fromDate: string,
  limit = 8,
): Promise<SocialCalendarEvent[]> {
  const db = await getDb();
  const docs = await db
    .collection('social_calendar_events')
    .find({
      unit_id: unitId,
      event_date: { $gte: fromDate },
    })
    .sort({ event_date: 1, title: 1 })
    .limit(limit)
    .toArray();

  return docs.map(mapEvent);
}

export async function getCalendarPublish(
  unitId: string,
  year: number,
  month: number,
): Promise<CalendarPublish | null> {
  const db = await getDb();
  const doc = (await db.collection('social_calendar_publishes').findOne({
    unit_id: unitId,
    year: Number(year),
    month: Number(month),
  })) as {
    id?: unknown;
    unit_id?: unknown;
    year?: unknown;
    month?: unknown;
    published_at?: unknown;
    published_by?: string | null;
  } | null;

  if (!doc) return null;

  return {
    id: String(doc.id),
    unit_id: String(doc.unit_id),
    year: Number(doc.year),
    month: Number(doc.month),
    published_at: String(doc.published_at),
    published_by: doc.published_by ?? null,
  };
}
