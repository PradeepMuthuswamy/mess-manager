// Client-safe row types for the social calendar. queries.ts is `server-only` —
// importing a type from it still pulls the module into the client bundle, so
// these shared shapes live here with no server-only marker / runtime deps.

import type { EventType } from '@/lib/schemas/calendar';

export type { EventType };

export type SocialCalendarEvent = {
  id: string;
  unit_id: string;
  event_date: string;
  end_date: string | null;
  event_type: EventType;
  title: string;
  description: string | null;
  profile_id: string | null;
  party_id: string | null;
  is_recurring: boolean;
  created_at: string;
  created_by: string | null;
};

export type CalendarPublish = {
  id: string;
  unit_id: string;
  year: number;
  month: number;
  published_at: string;
  published_by: string | null;
};
