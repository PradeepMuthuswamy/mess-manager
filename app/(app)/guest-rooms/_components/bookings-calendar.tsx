'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { fetchMonthBookingsAction } from '@/lib/guest-rooms/actions';
import type { Booking } from '@/lib/guest-rooms/types';
import { cn } from '@/lib/utils';

// All status styles use design tokens only — no raw colors.
const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-primary/15 text-primary',
  checked_in: 'bg-primary text-primary-foreground',
  checked_out: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/15 text-destructive line-through',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BookingsCalendar({
  unitId,
}: {
  unitId: string;
}) {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date(), []);

  // Visible grid spans from the Sunday of the first week to the Saturday of
  // the last week — typically 6 rows × 7 columns.
  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
    [cursor],
  );
  const gridEnd = useMemo(
    () => endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),
    [cursor],
  );
  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const from = format(gridStart, 'yyyy-MM-dd');
      const to = format(gridEnd, 'yyyy-MM-dd');
      const res = await fetchMonthBookingsAction(unitId, from, to);
      if (cancelled) return;
      if (res.error) {
        console.error('Failed to fetch bookings:', res.error);
        setBookings([]);
      } else {
        setBookings(res.data ?? []);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [unitId, gridStart, gridEnd]);

  // For each grid day, find bookings that cover it (check_in inclusive,
  // check_out exclusive — the last booked night is check_out − 1).
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const ci = parseISO(b.check_in_date);
      const co = parseISO(b.check_out_date);
      for (const d of eachDayOfInterval({ start: ci, end: co })) {
        if (isSameDay(d, co)) continue; // checkout day is not a booked night
        const key = format(d, 'yyyy-MM-dd');
        const list = map.get(key) ?? [];
        list.push(b);
        map.set(key, list);
      }
    }
    return map;
  }, [bookings]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <div className="text-base font-semibold font-heading tracking-tight">
            {format(cursor, 'MMMM yyyy')}
          </div>
          <div className="text-xs text-muted-foreground">
            {loading
              ? 'Loading bookings…'
              : `${bookings.length} booking${bookings.length === 1 ? '' : 's'} in view`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="transition-ds"
            onClick={() => setCursor(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            className="transition-ds"
            onClick={() => setCursor(subMonths(cursor, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            className="transition-ds"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 border-t">
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEKDAY_LABELS.map((l) => (
            <div
              key={l}
              className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-r last:border-r-0 uppercase tracking-wide"
            >
              {l}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-6">
          {days.map((day) => {
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, today);
            const key = format(day, 'yyyy-MM-dd');
            const dayBookings = bookingsByDay.get(key) ?? [];
            const visible = dayBookings.slice(0, 3);
            const hidden = dayBookings.length - visible.length;
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-h-28 p-1.5 border-r border-b last:border-r-0 flex flex-col gap-1 transition-ds',
                  inMonth ? 'bg-background' : 'bg-muted/30',
                )}
              >
                <div className="flex justify-end">
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-ds',
                      isToday
                        ? 'ring-2 ring-primary ring-offset-1 text-primary font-semibold'
                        : inMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {visible.map((b) => (
                    <div
                      key={b.id}
                      title={`${b.guest_name} — ${b.room.name} — ${b.status.replace('_', ' ')}`}
                      className={cn(
                        'truncate rounded px-1.5 py-0.5 text-[11px] leading-tight transition-ds',
                        STATUS_STYLES[b.status] ??
                          'bg-muted text-muted-foreground',
                      )}
                    >
                      {b.guest_name}
                    </div>
                  ))}
                  {hidden > 0 ? (
                    <div className="px-1.5 text-[10px] text-muted-foreground">
                      +{hidden} more
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground bg-muted/20">
          <span className="font-medium text-foreground">Status</span>
          <LegendDot className="bg-primary/15 text-primary" label="Confirmed" />
          <LegendDot
            className="bg-primary text-primary-foreground"
            label="Checked in"
          />
          <LegendDot
            className="bg-muted text-muted-foreground"
            label="Checked out"
          />
          <LegendDot
            className="bg-destructive/15 text-destructive"
            label="Cancelled"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={[
          'inline-block size-3 rounded-sm',
          className,
        ].join(' ')}
      />
      {label}
    </span>
  );
}
