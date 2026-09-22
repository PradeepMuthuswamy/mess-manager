import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EventType } from '@/lib/calendar/types';
import { CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

export type SocialUpcomingItem = {
  id: string;
  title: string;
  event_date: string;
  event_type: EventType | string;
  end_date?: string | null;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  anniversary: 'Anniversary',
  birthday: 'Birthday',
  mess_party: 'Mess party',
  individual_party: 'Individual party',
  formal_night: 'Formal night',
  holiday: 'Holiday',
  other: 'Other',
};

function typeLabel(type: string) {
  return EVENT_TYPE_LABEL[type] ?? type.replaceAll('_', ' ');
}

function formatRange(start: string, end?: string | null) {
  const from = format(parseISO(start), 'dd MMM');
  if (!end || end === start) return from;
  return `${from} – ${format(parseISO(end), 'dd MMM')}`;
}

export function SocialUpcomingCard({
  events,
  unbilledHint,
}: {
  events: SocialUpcomingItem[];
  unbilledHint?: string | null;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
            Upcoming socials
          </span>
          <Link
            href="/calendar"
            className="font-mono text-[10px] font-medium normal-case text-primary hover:underline"
          >
            Calendar
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {events.length === 0 ? (
          <p className="text-muted-foreground">No upcoming events.</p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                  <p className="font-mono text-muted-foreground">
                    {formatRange(event.event_date, event.end_date)}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {typeLabel(event.event_type)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {unbilledHint ? (
          <p className="border-t border-border pt-2 text-muted-foreground">{unbilledHint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
