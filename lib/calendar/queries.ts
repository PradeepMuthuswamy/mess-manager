import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CalendarPublish, SocialCalendarEvent } from './types';

const EVENT_COLUMNS =
  'id, unit_id, event_date, end_date, event_type, title, description, profile_id, party_id, is_recurring, created_at, created_by';

const PUBLISH_COLUMNS = 'id, unit_id, year, month, published_at, published_by';

export async function listCalendarEvents(
  unitId: string,
  from: string,
  to: string,
): Promise<SocialCalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('social_calendar_events')
    .select(EVENT_COLUMNS)
    .eq('unit_id', unitId)
    .lte('event_date', to)
    .or(`end_date.gte.${from},event_date.gte.${from}`)
    .order('event_date', { ascending: true })
    .order('title', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SocialCalendarEvent[];
}

export async function listUpcomingCalendarEvents(
  unitId: string,
  fromDate: string,
  limit = 8,
): Promise<SocialCalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('social_calendar_events')
    .select(EVENT_COLUMNS)
    .eq('unit_id', unitId)
    .gte('event_date', fromDate)
    .order('event_date', { ascending: true })
    .order('title', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as SocialCalendarEvent[];
}

export async function getCalendarPublish(
  unitId: string,
  year: number,
  month: number,
): Promise<CalendarPublish | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('social_calendar_publishes')
    .select(PUBLISH_COLUMNS)
    .eq('unit_id', unitId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as CalendarPublish | null;
}
