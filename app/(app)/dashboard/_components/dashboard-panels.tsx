import { userHasCapability } from '@/lib/auth/capabilities';
import type { AuthUser } from '@/lib/auth/types';
import { getCollection } from '@/lib/mongo';
import { getDinerTodayStatus } from '@/lib/messing/queries';
import { listPendingRegisters } from '@/lib/messing/register-queries';
import { getMyMessBills } from '@/lib/billing/queries';
import type { WidgetId } from '@/lib/dashboard/compose';
import { listUpcomingCalendarEvents } from '@/lib/calendar/queries';
import { RegisterApprovalQueue } from './register-approval-queue';
import { PresidentKpis } from './president-kpis';
import { SocialUpcomingCard } from './social-upcoming-card';
import { DutyDesk, DutyIcons, type DutyDeskItem } from './duty-desk';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listUnitBulletins } from '@/lib/bulletins/queries';
import { listUpcomingParties, listMyPartyCharges } from '@/lib/parties/queries';
import { listMyWaitlist } from '@/lib/waitlist/queries';
import { listMyBarChits } from '@/lib/dashboard/member-queries';
import { CalendarDays, Coffee, Flame, Utensils, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { format, subDays } from 'date-fns';

const MEAL_ICONS: Record<string, LucideIcon> = {
  breakfast: Coffee,
  lunch: Utensils,
  dinner: Flame,
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inr(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type DashboardPanelsProps = {
  user: AuthUser;
  unitId: string | null;
  widgetIds: WidgetId[];
  skipWriteCtas: boolean;
  roleLabel: string;
  displayName: string;
  email: string;
  rank: string | null;
  serviceNo: string | null;
  diningIn: boolean | null;
};

export async function DashboardPanels({
  user,
  unitId,
  widgetIds,
  skipWriteCtas,
  roleLabel,
  displayName,
  email,
  rank,
  serviceNo,
  diningIn,
}: DashboardPanelsProps) {
  const date = todayIso();
  const hasWidget = (id: WidgetId) => widgetIds.includes(id);
  const canApproveRegister =
    !skipWriteCtas && unitId ? userHasCapability(user, 'messing.approve', unitId) : false;
  const since = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const [
    dinerToday,
    myBills,
    bookings,
    bulletins,
    parties,
    waitlist,
    barChits,
    partyCharges,
    pendingRegisters,
    upcomingEvents,
  ] = await Promise.all([
    unitId ? getDinerTodayStatus(unitId, user.id, date).catch(() => null) : Promise.resolve(null),
    getMyMessBills(user.id).catch(() => []),
    unitId
      ? (async () => {
          try {
            const bookingsCol = await getCollection('bookings');
            const rawBookings = await bookingsCol
              .find({
                unit_id: unitId,
                host_profile_id: user.id,
                status: { $in: ['confirmed', 'checked_in'] },
                check_out_date: { $gte: date },
              })
              .sort({ check_in_date: 1 })
              .toArray();

            if (rawBookings.length === 0) return [];

            const roomIds = Array.from(new Set(rawBookings.map((b: Record<string, unknown>) => b.room_id).filter(Boolean)));
            const roomsCol = await getCollection('rooms');
            const rooms = await roomsCol.find({ id: { $in: roomIds } }).toArray();
            const roomMap = new Map(rooms.map((r: Record<string, unknown>) => [String(r.id || r._id), String(r.name)]));

            return rawBookings.map((b: Record<string, unknown>) => ({
              id: String(b.id || b._id),
              guest_name: b.guest_name ? String(b.guest_name) : null,
              check_in_date: String(b.check_in_date),
              check_out_date: String(b.check_out_date),
              status: String(b.status),
              room: b.room_id ? { name: roomMap.get(String(b.room_id)) ?? null } : null,
            }));
          } catch {
            return [];
          }
        })()
      : Promise.resolve([]),
    unitId ? listUnitBulletins(unitId, 3).catch(() => []) : Promise.resolve([]),
    unitId ? listUpcomingParties(unitId, date).catch(() => []) : Promise.resolve([]),
    unitId ? listMyWaitlist(unitId, user.id).catch(() => []) : Promise.resolve([]),
    unitId ? listMyBarChits(unitId, user.id, since).catch(() => []) : Promise.resolve([]),
    unitId ? listMyPartyCharges(unitId, user.id).catch(() => []) : Promise.resolve([]),
    unitId && (canApproveRegister || hasWidget('register-queue'))
      ? listPendingRegisters(unitId).catch(() => [])
      : Promise.resolve([]),
    unitId && hasWidget('social-upcoming')
      ? listUpcomingCalendarEvents(unitId, date, 5).catch(() => [])
      : Promise.resolve([]),
  ]);

  const unpaidBills = myBills.filter((b) => b.status === 'published' || b.status === 'overdue');
  const totalOutstanding = unpaidBills.reduce((sum, b) => sum + Number(b.total_amount), 0);
  const nextDue = unpaidBills[0];
  const occupancyLabel =
    bookings.length === 0
      ? 'No current occupancy'
      : `${bookings.length} active booking${bookings.length === 1 ? '' : 's'}`;
  const pendingChitCount = barChits.filter(
    (chit) => !['finalized', 'billed', 'closed', 'cancelled'].includes(chit.status),
  ).length;
  const arrivalsCount = bookings.filter((booking) => booking.check_in_date === date).length;
  const socialEvents =
    upcomingEvents.length > 0
      ? upcomingEvents
      : parties.slice(0, 5).map((party) => ({
          id: party.id,
          title: party.title,
          event_date: party.party_date,
          event_type: 'mess_party' as const,
        }));
  const unbilledPartyTotal = partyCharges
    .filter((c) => !c.is_billed)
    .reduce((s, c) => s + c.amount, 0);
  const unbilledHint =
    unbilledPartyTotal > 0 ? `Unbilled party charges: ${inr(unbilledPartyTotal)}` : null;

  const showPresident = hasWidget('president-kpis');
  const showGuestCard = !showPresident && !hasWidget('arrivals');
  const showOutstanding = !showPresident;
  const showPartiesCard = !hasWidget('social-upcoming');

  const dutyItems: DutyDeskItem[] = [];
  if (hasWidget('bar-pending')) {
    dutyItems.push({
      href: '/bar',
      label: 'Open chits',
      value: String(pendingChitCount),
      hint: pendingChitCount === 0 ? 'Bar book is clear' : 'Waiting to be finalized',
      icon: DutyIcons.Wine,
      tone: pendingChitCount > 0 ? 'warning' : 'default',
    });
  }
  if (hasWidget('arrivals')) {
    dutyItems.push({
      href: '/guest-rooms',
      label: 'Arrivals',
      value: String(arrivalsCount),
      hint:
        bookings.length === 0
          ? 'No hosted bookings on the desk'
          : `${bookings.length} of your bookings are current`,
      icon: DutyIcons.BedDouble,
      tone: arrivalsCount > 0 ? 'info' : 'default',
    });
  }
  if (hasWidget('havildar-today')) {
    dutyItems.push({
      href: '/messing',
      label: 'Day roll',
      value: !dinerToday ? 'Not posted' : dinerToday.isAttendingDay ? 'On roll' : 'Absent',
      hint: 'Post attendance, then kitchen spend',
      icon: DutyIcons.ClipboardList,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {hasWidget('register-queue') ? (
        <RegisterApprovalQueue pending={pendingRegisters} canApprove={canApproveRegister} />
      ) : null}

      {showPresident ? (
        <PresidentKpis
          outstandingTotal={totalOutstanding}
          unpaidCount={unpaidBills.length}
          occupancyLabel={occupancyLabel}
          rationAlert={null}
        />
      ) : null}

      <DutyDesk items={dutyItems} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-foreground">
            <Utensils className="size-4 text-muted-foreground" />
            Today&apos;s messing
          </h2>
          <Card className="border-border">
            {!dinerToday || !unitId ? (
              <CardContent className="py-8 text-sm text-muted-foreground">
                {unitId
                  ? 'Messing data is not available for today.'
                  : 'Assign a unit to see today’s dining register.'}
              </CardContent>
            ) : (
              <>
                <CardHeader className="pb-2">
                  <CardDescription>
                    {format(new Date(date), 'dd MMMM yyyy')}
                    {dinerToday.billingMode === 'P_REGISTER_SPLIT' ? ' · P-register' : ' · Flat rate'}
                    {' · '}
                    {dinerToday.isAttendingDay ? 'On the day roll' : 'Marked absent'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-0 divide-y divide-border p-0">
                  {dinerToday.meals.map((meal) => {
                    const Icon = MEAL_ICONS[meal.mealType] ?? Utensils;
                    return (
                      <div key={meal.mealType} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-md bg-muted p-2 text-primary">
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{meal.label}</p>
                            {meal.cutReason ? (
                              <p className="text-xs text-muted-foreground">{meal.cutReason}</p>
                            ) : dinerToday.billingMode === 'FLAT_RATE' && meal.rate > 0 ? (
                              <p className="font-mono text-xs text-muted-foreground">{inr(meal.rate)}</p>
                            ) : null}
                          </div>
                        </div>
                        <Badge variant={meal.isCut ? 'destructive' : dinerToday.isAttendingDay ? 'success' : 'secondary'}>
                          {meal.isCut ? 'Cut' : dinerToday.isAttendingDay ? 'Registered' : 'Absent'}
                        </Badge>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs text-muted-foreground">Estimated today</span>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {inr(dinerToday.estimatedDailyCharge)}
                    </span>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
          <Button variant="outline" size="sm" className="self-start" asChild>
            <Link href="/messing">Open messing</Link>
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          {showOutstanding ? (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Outstanding dues
                  <Link href="/billing" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                    View bills
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {unpaidBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No published unpaid bills.</p>
                ) : (
                  <>
                    <p className="font-mono text-3xl font-bold tracking-tight text-foreground tabular">
                      {inr(totalOutstanding)}
                    </p>
                    {nextDue?.due_date && (
                      <p className="text-xs text-muted-foreground">
                        Next due {format(new Date(nextDue.due_date), 'dd MMM yyyy')}
                        {nextDue.bill_number ? ` · ${nextDue.bill_number}` : ''}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {showGuestCard ? (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Guest rooms
                  <Link
                    href="/guest-rooms"
                    className="font-mono text-[10px] font-medium normal-case text-primary hover:underline"
                  >
                    Open
                  </Link>
                </CardTitle>
                <CardDescription>Your current and upcoming bookings</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {bookings.length === 0 ? (
                  <div className="flex flex-col items-center py-4 text-center text-xs text-muted-foreground">
                    <CalendarDays className="mb-2 size-6 text-muted-foreground/40" />
                    No active bookings.
                  </div>
                ) : (
                  bookings.map((booking) => {
                    const room = Array.isArray(booking.room) ? booking.room[0] : booking.room;
                    return (
                      <div key={booking.id} className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {room?.name ?? 'Room'}
                          </span>
                          <Badge variant="outline" className="font-mono text-[10px] capitalize">
                            {booking.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {booking.guest_name ?? 'Guest'} ·{' '}
                          {format(new Date(booking.check_in_date), 'dd MMM')} –{' '}
                          {format(new Date(booking.check_out_date), 'dd MMM yyyy')}
                        </p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ) : null}

          {hasWidget('social-upcoming') ? (
            <SocialUpcomingCard events={socialEvents} unbilledHint={unbilledHint} />
          ) : null}

          {showPartiesCard ? (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Parties
                  <Link href="/party" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                    Open
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-xs">
                {parties.length === 0 ? (
                  <p className="text-muted-foreground">No upcoming parties.</p>
                ) : (
                  parties.slice(0, 3).map((party) => (
                    <div key={party.id} className="flex justify-between gap-2">
                      <span className="text-foreground">{party.title}</span>
                      <span className="font-mono text-muted-foreground">
                        {format(new Date(party.party_date), 'dd MMM')}
                      </span>
                    </div>
                  ))
                )}
                {unbilledHint ? <p className="text-muted-foreground">{unbilledHint}</p> : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Bulletins
                <Link href="/bulletins" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                  All
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {bulletins.length === 0 ? (
                <p className="text-xs text-muted-foreground">No notices published.</p>
              ) : (
                bulletins.map((item) => (
                  <div key={item.id}>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Bar account
                <Link href="/reports" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                  Report
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-xs">
              {barChits.length === 0 ? (
                <p className="text-muted-foreground">No bar chits in the last 30 days.</p>
              ) : (
                <>
                  <p className="font-mono text-lg font-semibold text-foreground tabular">
                    {inr(barChits.reduce((s, c) => s + c.total_amount, 0))}
                  </p>
                  {barChits.slice(0, 3).map((chit) => (
                    <div key={chit.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {format(new Date(chit.date), 'dd MMM')} · {chit.status}
                      </span>
                      <span className="font-mono tabular">{inr(chit.total_amount)}</span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Room requests
                <Link href="/waitlist" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                  Request
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-xs">
              {waitlist.length === 0 ? (
                <p className="text-muted-foreground">No open room requests.</p>
              ) : (
                waitlist.slice(0, 3).map((row) => (
                  <div key={row.id} className="flex justify-between gap-2">
                    <span className="text-foreground">{row.guest_name}</span>
                    <span className="capitalize text-muted-foreground">{row.status}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Your profile
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <p className="font-heading font-semibold text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground">{email}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{roleLabel}</Badge>
                {diningIn != null && (
                  <Badge variant="secondary">{diningIn ? 'Dining in' : 'Dining out'}</Badge>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Service no.</dt>
                  <dd className="font-mono text-foreground">{serviceNo ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rank</dt>
                  <dd className="text-foreground">{rank ?? '—'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
