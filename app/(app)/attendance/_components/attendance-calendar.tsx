'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MonthlyAttendance } from '@/lib/attendance/types';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceCalendar({
  data,
}: {
  data: MonthlyAttendance;
}) {
  const router = useRouter();
  const todayIso = isoToday();
  const [y, m] = data.month.split('-').map(Number);

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // JS getUTCDay: 0=Sun..6=Sat → convert to Mon=0..Sun=6
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${data.month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  function go(month: string) {
    router.push(`/attendance?view=calendar&month=${month}`);
  }

  return (
    <div className="space-y-4">
      {/* Month nav + summary badges */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => go(shiftMonth(data.month, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-44 text-center text-sm font-medium text-foreground">
            {monthLabel(data.month)}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => go(shiftMonth(data.month, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex-1" />
        <Badge variant="secondary" className="font-mono tabular-nums text-xs">
          Avg present:{' '}
          <span className="ml-1 font-semibold">
            {data.average_present == null ? '—' : data.average_present}
          </span>
        </Badge>
        <Badge variant="outline" className="font-mono tabular-nums text-xs">
          Roster:{' '}
          <span className="ml-1 font-semibold">{data.roster_total}</span>
        </Badge>
        <Badge variant="outline" className="font-mono tabular-nums text-xs">
          <span className="font-semibold">{data.recorded_days}</span> recorded
        </Badge>
      </div>

      {/* Calendar grid */}
      <div className="rounded-md border border-border overflow-hidden">
        {/* Weekday header row */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/50">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>

        {/* Day cells — 7-col grid, rows separated by border */}
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            if (!date) {
              return (
                <div
                  key={`x${i}`}
                  className={cn(
                    'min-h-20 bg-muted/30',
                    i % 7 !== 6 && 'border-r border-border',
                    i >= 7 && 'border-t border-border',
                  )}
                />
              );
            }
            const day = data.days[date];
            const dayNum = Number(date.slice(-2));
            const isToday = date === todayIso;
            const isFinalized = day?.status === 'finalized';

            return (
              <button
                key={date}
                onClick={() => router.push(`/attendance?date=${date}`)}
                className={cn(
                  'flex min-h-20 flex-col gap-1 p-2 text-left transition-ds hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  i % 7 !== 6 && 'border-r border-border',
                  i >= 7 && 'border-t border-border',
                )}
                aria-label={`${date}${day ? `, ${day.present_count} present` : ''}`}
              >
                {/* Day number */}
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                    isToday
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  {dayNum}
                </span>

                {day ? (
                  <>
                    {/* Present count */}
                    <span
                      className={cn(
                        'font-mono text-base font-semibold tabular-nums leading-none',
                        isFinalized ? 'text-success' : 'text-foreground',
                      )}
                    >
                      {day.present_count}
                    </span>
                    {/* Status badge */}
                    <Badge
                      variant={isFinalized ? 'default' : 'outline'}
                      className="w-fit px-1.5 py-0 text-[10px] leading-4"
                    >
                      {isFinalized ? 'Final' : 'Draft'}
                    </Badge>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/50">—</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
