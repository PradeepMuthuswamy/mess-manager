'use client';

import { useMemo, useState } from 'react';
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
  addDays,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Plus,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import type { Booking } from '@/lib/guest-rooms/types';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-primary/15 text-primary',
  checked_in: 'bg-primary text-primary-foreground',
  checked_out: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/15 text-destructive line-through',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BookingsCalendar({
  bookings,
  cursor,
  setCursor,
  loading,
  onViewBooking,
  onNewBooking,
}: {
  bookings: Booking[];
  cursor: Date;
  setCursor: (d: Date) => void;
  loading: boolean;
  onViewBooking: (b: Booking) => void;
  onNewBooking: (date: Date) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const today = useMemo(() => new Date(), []);

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

  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return bookings;
    const query = searchQuery.toLowerCase().trim();
    return bookings.filter((b) => {
      const nameMatch = b.guest_name?.toLowerCase().includes(query);
      const rankMatch = b.guest_rank?.toLowerCase().includes(query);
      const phoneMatch = b.guest_phone?.toLowerCase().includes(query);
      const emailMatch = b.guest_email?.toLowerCase().includes(query);
      const roomMatch = b.room?.name?.toLowerCase().includes(query);
      return nameMatch || rankMatch || phoneMatch || emailMatch || roomMatch;
    });
  }, [bookings, searchQuery]);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of filteredBookings) {
      const ci = parseISO(b.check_in_date);
      const co = parseISO(b.check_out_date);
      for (const d of eachDayOfInterval({ start: ci, end: co })) {
        if (isSameDay(d, co)) continue;
        const key = format(d, 'yyyy-MM-dd');
        const list = map.get(key) ?? [];
        list.push(b);
        map.set(key, list);
      }
    }
    return map;
  }, [filteredBookings]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
          <div>
            <div className="text-base font-semibold font-heading tracking-tight">
              {format(cursor, 'MMMM yyyy')}
            </div>
            <div className="text-xs text-muted-foreground">
              {loading
                ? 'Loading bookings…'
                : searchQuery.trim()
                  ? `${filteredBookings.length} of ${bookings.length} booking${bookings.length === 1 ? '' : 's'} matched`
                  : `${bookings.length} booking${bookings.length === 1 ? '' : 's'} in view`}
            </div>
          </div>
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search guest, room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="transition-ds cursor-pointer"
            onClick={() => setCursor(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            className="transition-ds cursor-pointer"
            onClick={() => setCursor(subMonths(cursor, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            className="transition-ds cursor-pointer"
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
                onClick={() => onNewBooking(day)}
                className={cn(
                  'min-h-28 p-1.5 border-r border-b last:border-r-0 flex flex-col gap-1 transition-ds cursor-pointer hover:bg-muted/10',
                  inMonth ? 'bg-background' : 'bg-muted/30',
                )}
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDay(day);
                    }}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-ds hover:bg-muted cursor-pointer',
                      isToday
                        ? 'ring-2 ring-primary ring-offset-1 text-primary font-semibold'
                        : inMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                    )}
                  >
                    {day.getDate()}
                  </button>
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {visible.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewBooking(b);
                      }}
                      title={`${b.guest_name} — ${b.room.name} — ${b.status.replace('_', ' ')}`}
                      className={cn(
                        'w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] leading-tight transition-ds hover:opacity-85 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer',
                        STATUS_STYLES[b.status] ??
                          'bg-muted text-muted-foreground',
                      )}
                    >
                      {b.guest_name}
                    </button>
                  ))}
                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDay(day);
                      }}
                      className="px-1.5 text-[10px] text-muted-foreground hover:text-foreground font-medium text-left cursor-pointer"
                    >
                      +{hidden} more
                    </button>
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

      {/* Day Bookings Modal */}
      <AdaptiveModal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? `Bookings for ${format(selectedDay, 'dd MMMM yyyy')}` : 'Day Bookings'}
        description="Select a booking to manage, or schedule a new room reservation."
      >
        {selectedDay && (
          <div className="space-y-4 py-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  onNewBooking(selectedDay);
                  setSelectedDay(null);
                }}
                className="cursor-pointer"
              >
                <Plus className="mr-1.5 size-4" />
                New Booking
              </Button>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {(() => {
                const key = format(selectedDay, 'yyyy-MM-dd');
                const dayBookings = bookingsByDay.get(key) ?? [];
                if (dayBookings.length === 0) {
                  return (
                    <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground text-sm font-medium">
                      No bookings scheduled for this day.
                    </div>
                  );
                }
                return dayBookings.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      onViewBooking(b);
                      setSelectedDay(null);
                    }}
                    className="w-full text-left p-3 border border-border rounded-lg hover:bg-muted/30 transition-ds flex items-center justify-between cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <div>
                      <p className="font-semibold text-sm text-foreground">
                        {b.guest_name}
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">
                        {b.guest_rank ? `${b.guest_rank} · ` : ''}Room {b.room?.name || '—'}
                      </p>
                    </div>
                    <Badge
                      variant={
                        b.status === 'confirmed'
                          ? 'secondary'
                          : b.status === 'checked_in'
                            ? 'default'
                            : b.status === 'checked_out'
                              ? 'outline'
                              : 'destructive'
                      }
                      className="capitalize text-xs px-2"
                    >
                      {b.status.replace('_', ' ')}
                    </Badge>
                  </button>
                ));
              })()}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setSelectedDay(null)} className="cursor-pointer">
                Close
              </Button>
            </div>
          </div>
        )}
      </AdaptiveModal>
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
