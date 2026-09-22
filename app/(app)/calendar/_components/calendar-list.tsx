'use client';

import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';
import type { EventType, SocialCalendarEvent } from '@/lib/calendar/types';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  anniversary: 'Anniversary',
  birthday: 'Birthday',
  mess_party: 'Mess party',
  individual_party: 'Individual party',
  formal_night: 'Formal night',
  holiday: 'Holiday',
  other: 'Other',
};

export const EVENT_TYPE_DOT: Record<EventType, string> = {
  anniversary: 'bg-chart-1',
  birthday: 'bg-chart-2',
  mess_party: 'bg-chart-3',
  individual_party: 'bg-chart-4',
  formal_night: 'bg-chart-5',
  holiday: 'bg-primary',
  other: 'bg-muted-foreground',
};

function formatIso(iso: string, pattern: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return format(new Date(y, m - 1, d), pattern);
}

function groupByDate(events: SocialCalendarEvent[]) {
  const sorted = [...events].sort(
    (a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title),
  );
  const groups: Array<{ date: string; events: SocialCalendarEvent[] }> = [];
  for (const event of sorted) {
    const last = groups.at(-1);
    if (last && last.date === event.event_date) {
      last.events.push(event);
    } else {
      groups.push({ date: event.event_date, events: [event] });
    }
  }
  return groups;
}

export function CalendarList({ events }: { events: SocialCalendarEvent[] }) {
  const groups = groupByDate(events);

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" />}
        title="No events this month"
        description="Add an event, import a CSV, or generate birthdays and anniversaries."
      />
    );
  }

  return (
    <Card className="border-border">
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {groups.map((group) => (
            <li key={group.date} className="px-4 py-3 sm:px-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {formatIso(group.date, 'EEEE, d MMMM yyyy')}
              </p>
              <ul className="mt-2 space-y-2">
                {group.events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start justify-between gap-3 rounded-md bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn('size-2 shrink-0 rounded-full', EVENT_TYPE_DOT[event.event_type])}
                          aria-hidden
                        />
                        <p className="truncate font-medium text-foreground">{event.title}</p>
                      </div>
                      {event.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                      ) : null}
                      {event.end_date && event.end_date !== event.event_date ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Through {formatIso(event.end_date, 'd MMM yyyy')}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {EVENT_TYPE_LABELS[event.event_type]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
