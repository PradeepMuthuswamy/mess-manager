import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import type { Role } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase/server';
import { getDinerTodayStatus } from '@/lib/messing/queries';
import { listPendingRegisters } from '@/lib/messing/register-queries';
import { getMyMessBills } from '@/lib/billing/queries';
import { RegisterApprovalQueue } from './_components/register-approval-queue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listUnitBulletins } from '@/lib/bulletins/queries';
import { listUpcomingParties, listMyPartyCharges } from '@/lib/parties/queries';
import { listMyWaitlist } from '@/lib/waitlist/queries';
import { listMyBarChits } from '@/lib/dashboard/member-queries';
import {
  CalendarDays,
  Coffee,
  Flame,
  Utensils,
} from 'lucide-react';
import Link from 'next/link';
import { format, subDays } from 'date-fns';
import type { LucideIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<Role, string> = {
  user: 'Member',
  manager: 'Manager',
  unit_admin: 'Unit Admin',
  super_admin: 'Super Admin',
  mess_secretary: 'Mess Secretary',
  mess_havildar: 'Mess Havildar',
  bar_nco: 'Bar NCO',
  property_nco: 'Property NCO',
};

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

export default async function DashboardPage() {
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;
  const date = todayIso();
  const supabase = await createClient();

  const [{ data: profile }, { data: unit }] = await Promise.all([
    supabase
      .from('profiles')
      .select('rank, service_no, full_name, display_name, dining_in')
      .eq('id', user.id)
      .maybeSingle(),
    unitId
      ? supabase.from('units').select('id, name, code').eq('id', unitId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const since = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const canApproveRegister = unitId ? userHasCapability(user, 'messing.approve', unitId) : false;

  const [dinerToday, myBills, bookings, bulletins, parties, waitlist, barChits, partyCharges, pendingRegisters] =
    await Promise.all([
      unitId
        ? getDinerTodayStatus(unitId, user.id, date).catch(() => null)
        : Promise.resolve(null),
      getMyMessBills(user.id).catch(() => []),
      unitId
        ? supabase
            .from('bookings')
            .select('id, guest_name, check_in_date, check_out_date, status, room:room_id (name)')
            .eq('unit_id', unitId)
            .eq('host_profile_id', user.id)
            .in('status', ['confirmed', 'checked_in'])
            .gte('check_out_date', date)
            .order('check_in_date', { ascending: true })
            .then(({ data, error }) => (error ? [] : (data ?? [])))
        : Promise.resolve([]),
      unitId ? listUnitBulletins(unitId, 3).catch(() => []) : Promise.resolve([]),
      unitId ? listUpcomingParties(unitId, date).catch(() => []) : Promise.resolve([]),
      unitId ? listMyWaitlist(unitId, user.id).catch(() => []) : Promise.resolve([]),
      unitId ? listMyBarChits(unitId, user.id, since).catch(() => []) : Promise.resolve([]),
      unitId ? listMyPartyCharges(unitId, user.id).catch(() => []) : Promise.resolve([]),
      unitId && canApproveRegister
        ? listPendingRegisters(unitId).catch(() => [])
        : Promise.resolve([]),
    ]);

  const unpaidBills = myBills.filter((b) => b.status === 'published' || b.status === 'overdue');
  const totalOutstanding = unpaidBills.reduce((sum, b) => sum + Number(b.total_amount), 0);
  const nextDue = unpaidBills[0];
  const displayName = profile?.display_name ?? profile?.full_name ?? user.displayName ?? user.email;
  const greetingName = displayName.includes('@') ? displayName.split('@')[0] : displayName;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-mono uppercase tracking-widest text-primary">Officer portal</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {greetingName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {unit ? `${unit.name} (${unit.code})` : 'No unit assigned'}
            {profile?.rank ? ` · ${profile.rank}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link href="/messing">Messing</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/billing">Bills</Link>
          </Button>
        </div>
      </div>

      {canApproveRegister ? (
        <RegisterApprovalQueue pending={pendingRegisters} canApprove={canApproveRegister} />
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-heading font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">{ROLE_LABEL[user.role]}</Badge>
              {profile?.dining_in != null && (
                <Badge variant="secondary">{profile.dining_in ? 'Dining in' : 'Dining out'}</Badge>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Service no.</dt>
                <dd className="font-mono text-foreground">{profile?.service_no ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rank</dt>
                <dd className="text-foreground">{profile?.rank ?? '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Outstanding dues
              <Link href="/billing" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                View bills
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {unpaidBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No published unpaid bills.
              </p>
            ) : (
              <>
                <p className="font-mono text-3xl font-bold tracking-tight text-foreground">
                  {inr(totalOutstanding)}
                </p>
                {nextDue?.due_date && (
                  <p className="text-xs text-muted-foreground">
                    Next due {format(new Date(nextDue.due_date), 'dd MMM yyyy')}
                    {nextDue.bill_number ? ` · ${nextDue.bill_number}` : ''}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="block text-muted-foreground">Messing</span>
                    <span className="font-mono text-foreground">
                      {inr(unpaidBills.reduce((s, b) => s + Number(b.messing_amount), 0))}
                    </span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Other charges</span>
                    <span className="font-mono text-foreground">
                      {inr(
                        unpaidBills.reduce(
                          (s, b) =>
                            s +
                            Number(b.bar_amount) +
                            Number(b.room_amount) +
                            Number(b.guest_meal_amount) +
                            Number(b.subscriptions_amount) +
                            Number(b.misc_amount) +
                            Number(b.arrears_amount),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
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
          <CardContent className="space-y-3">
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
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
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
                          {meal.isCut ? 'Meal cut' : dinerToday.isAttendingDay ? 'Registered' : 'Absent'}
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
          <Button variant="outline" size="sm" asChild>
            <Link href="/messing">Open messing</Link>
          </Button>
        </div>

        <div className="space-y-4">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground">
            Unit &amp; account
          </h2>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Bulletins
                <Link href="/bulletins" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                  All
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                Parties
                <Link href="/party" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                  Open
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
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
              {partyCharges.some((c) => !c.is_billed) && (
                <p className="text-muted-foreground">
                  Unbilled party charges:{' '}
                  {inr(partyCharges.filter((c) => !c.is_billed).reduce((s, c) => s + c.amount, 0))}
                </p>
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
            <CardContent className="space-y-2 text-xs">
              {barChits.length === 0 ? (
                <p className="text-muted-foreground">No bar chits in the last 30 days.</p>
              ) : (
                <>
                  <p className="font-mono text-lg font-semibold text-foreground">
                    {inr(barChits.reduce((s, c) => s + c.total_amount, 0))}
                  </p>
                  {barChits.slice(0, 3).map((chit) => (
                    <div key={chit.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {format(new Date(chit.date), 'dd MMM')} · {chit.status}
                      </span>
                      <span className="font-mono">{inr(chit.total_amount)}</span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Room waitlist
                <Link href="/waitlist" className="font-mono text-[10px] font-medium normal-case text-primary hover:underline">
                  Request
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {waitlist.length === 0 ? (
                <p className="text-muted-foreground">No open waitlist requests.</p>
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
        </div>
      </div>
    </div>
  );
}
