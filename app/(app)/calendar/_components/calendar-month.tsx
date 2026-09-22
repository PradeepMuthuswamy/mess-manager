'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { EventType, SocialCalendarEvent } from '@/lib/calendar/types';
import { CalendarList, EVENT_TYPE_DOT, EVENT_TYPE_LABELS } from './calendar-list';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function eventsOnDay(events: SocialCalendarEvent[], iso: string) {
  return events.filter((event) => {
    const end = event.end_date ?? event.event_date;
    return event.event_date <= iso && end >= iso;
  });
}

export function CalendarMonth({
  events,
  year,
  month,
  onSelectDate,
}: {
  events: SocialCalendarEvent[];
  year: number;
  month: number;
  onSelectDate?: (iso: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<'month' | 'list'>('month');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const cursor = useMemo(() => new Date(year, month - 1, 1), [year, month]);
  const today = useMemo(() => new Date(), []);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, SocialCalendarEvent[]>();
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      map.set(key, eventsOnDay(events, key));
    }
    return map;
  }, [days, events]);

  function go(delta: number) {
    const next = delta < 0 ? subMonths(cursor, 1) : addMonths(cursor, 1);
    router.push(`${pathname}?month=${next.getMonth() + 1}&year=${next.getFullYear()}`);
  }

  const selectedKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null;
  const selectedEvents = selectedKey ? (eventsByDay.get(selectedKey) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => go(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-44 text-center text-sm font-medium text-foreground">
            {format(cursor, 'MMMM yyyy')}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => go(1)}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const now = new Date();
            router.push(`${pathname}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`);
          }}
        >
          Today
        </Button>
        <div className="flex-1" />
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={view === 'month' ? 'default' : 'outline'}
            onClick={() => setView('month')}
          >
            <CalendarDays className="size-4" />
            Month
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'list' ? 'default' : 'outline'}
            onClick={() => setView('list')}
          >
            <List className="size-4" />
            List
          </Button>
        </div>
      </div>

      {view === 'list' ? (
        <CalendarList events={events} />
      ) : (
        <Card className="border-border">
          <CardHeader className="sr-only">
            <span>{format(cursor, 'MMMM yyyy')} calendar</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b border-border bg-muted/50">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayEvents = eventsByDay.get(key) ?? [];
                const inMonth = isSameMonth(day, cursor);
                const isToday = isSameDay(day, today);
                const titles = dayEvents.slice(0, 2);
                const extra = dayEvents.length - titles.length;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDay(day);
                      onSelectDate?.(key);
                    }}
                    className={cn(
                      'flex min-h-24 flex-col gap-1 p-2 text-left transition-ds hover:bg-muted/40 active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      index % 7 !== 6 && 'border-r border-border',
                      index >= 7 && 'border-t border-border',
                      !inMonth && 'bg-muted/30',
                    )}
                    aria-label={`${format(day, 'd MMMM yyyy')}${
                      dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''
                    }`}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                        isToday
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : inMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground',
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayEvents.length > 0 ? (
                      <>
                        <span className="flex flex-wrap gap-1">
                          {dayEvents.slice(0, 4).map((event) => (
                            <span
                              key={event.id}
                              className={cn('size-1.5 rounded-full', EVENT_TYPE_DOT[event.event_type])}
                              title={event.title}
                            />
                          ))}
                        </span>
                        <ul className="hidden space-y-0.5 lg:block">
                          {titles.map((event) => (
                            <li
                              key={event.id}
                              className="truncate text-[11px] leading-tight text-foreground"
                            >
                              {event.title}
                            </li>
                          ))}
                          {extra > 0 ? (
                            <li className="text-[10px] text-muted-foreground">+{extra} more</li>
                          ) : null}
                        </ul>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
              {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((type) => (
                <span key={type} className="flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', EVENT_TYPE_DOT[type])} />
                  {EVENT_TYPE_LABELS[type]}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AdaptiveModal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? format(selectedDay, 'EEEE, d MMMM yyyy') : 'Day'}
        description="Events on this day."
      >
        <div className="space-y-2 py-2">
          {selectedEvents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              No events on this day.
            </p>
          ) : (
            selectedEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('size-2 shrink-0 rounded-full', EVENT_TYPE_DOT[event.event_type])}
                      aria-hidden
                    />
                    <p className="font-medium text-foreground">{event.title}</p>
                  </div>
                  {event.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                  ) : null}
                </div>
                <Badge variant="outline">{EVENT_TYPE_LABELS[event.event_type]}</Badge>
              </div>
            ))
          )}
        </div>
      </AdaptiveModal>
    </div>
  );
}
