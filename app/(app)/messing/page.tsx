import { requireCapability } from '@/lib/auth/require-capability';
import { userHasCapability } from '@/lib/auth/capabilities';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Coffee, Utensils, Flame, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getDinerTodayStatus,
  getDailyExpenditure,
  getMemberMealCuts,
  listGuestMeals,
  getMemberCycleMtd,
} from '@/lib/messing/queries';
import { getAttendanceDay } from '@/lib/attendance/queries';
import { MealCutToggle } from './_components/meal-cut-toggle';
import { KitchenExpenditureDialog } from './_components/kitchen-expenditure-dialog';
import { CasualGuestDialog } from './_components/casual-guest-dialog';
import { RegisterActions } from './_components/register-actions';
import { format, subDays, addDays, parseISO } from 'date-fns';
import { EmptyState } from '@/components/shared/empty-state';
import Link from 'next/link';
import type { RegisterStatus } from '@/lib/messing/types';

export const dynamic = 'force-dynamic';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const MEAL_ICONS = {
  breakfast: Coffee,
  lunch: Utensils,
  dinner: Flame,
  morning_tea: Coffee,
  evening_tea: Coffee,
  packed_breakfast: Coffee,
  packed_lunch: Utensils,
  packed_dinner: Flame,
};

const REGISTER_BADGE: Record<RegisterStatus, { label: string; variant: 'outline' | 'warning' | 'success' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  submitted: { label: 'Submitted', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

export default async function MessingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireCapability('attendance.read');
  const unitId = user.activeUnitId ?? user.homeUnitId;

  if (!unitId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
          Messing & Dining
        </h1>
        <EmptyState
          icon={<AlertCircle className="size-5" />}
          title="No active unit"
          description="Please select an active unit to view messing details."
        />
      </div>
    );
  }

  const { date: dateParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? (dateParam as string) : today();
  const prevDate = format(subDays(parseISO(date), 1), 'yyyy-MM-dd');
  const nextDate = format(addDays(parseISO(date), 1), 'yyyy-MM-dd');

  const supabase = await createClient();
  const canWriteAttendance = userHasCapability(user, 'attendance.write', unitId);
  const canApproveRegister = userHasCapability(user, 'messing.approve', unitId);

  let presentCount = 0;
  try {
    const attendance = await getAttendanceDay(unitId, date, supabase);
    presentCount = attendance.present_count;
  } catch {
    presentCount = 0;
  }

  const startDate = format(subDays(parseISO(date), 30), 'yyyy-MM-dd');
  const endDate = format(addDays(parseISO(date), 30), 'yyyy-MM-dd');

  const [dinerToday, expenditure, recentCuts, guestMeals, cycleMtd] = await Promise.all([
    getDinerTodayStatus(unitId, user.id, date),
    getDailyExpenditure(unitId, date),
    getMemberMealCuts(unitId, user.id, startDate, endDate),
    listGuestMeals(unitId, startDate, endDate, user.id),
    getMemberCycleMtd(unitId, user.id, date).catch(() => null),
  ]);

  const isPRegister = dinerToday.billingMode === 'P_REGISTER_SPLIT';
  const registerStatus = (expenditure?.register_status as RegisterStatus | undefined) ?? null;
  const registerBadge = registerStatus
    ? (REGISTER_BADGE[registerStatus] ?? { label: registerStatus, variant: 'outline' as const })
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <p className="text-xs font-mono uppercase tracking-widest text-primary">
              Officer Dining
            </p>
            <Badge variant="outline" className="text-[10px] font-mono">
              {isPRegister ? 'P-Register (Daily Average)' : 'Flat Rate System'}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
            Messing & Dining
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage daily meals, place advance messing, and review dining charges.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button asChild size="sm" variant="outline">
              <Link href={`/messing?date=${prevDate}`}>
                <ChevronLeft className="size-4" />
                Prev
              </Link>
            </Button>
            <span className="min-w-28 px-2 text-center font-mono text-sm text-foreground">
              {format(parseISO(date), 'dd MMM yyyy')}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={`/messing?date=${nextDate}`}>
                Next
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
          {canWriteAttendance && (
            <Button asChild size="sm" variant="outline">
              <Link href="/messing/cuts">Messing</Link>
            </Button>
          )}
          <CasualGuestDialog unitId={unitId} hostProfileId={user.id} date={date} />
          {canWriteAttendance && (
            <KitchenExpenditureDialog
              unitId={unitId}
              date={date}
              presentCount={presentCount}
              initialMorning={expenditure ? Number(expenditure.morning_amount) : 0}
              initialAfternoon={expenditure ? Number(expenditure.afternoon_amount) : 0}
              initialDinner={expenditure ? Number(expenditure.dinner_amount) : 0}
              initialVendor={expenditure?.vendor_name}
              initialNotes={expenditure?.notes}
              initialReceipt={expenditure?.receipt_ref}
              initialSourcing={expenditure?.sourcing_category}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card className="border-border bg-card/60 backdrop-blur-xs">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-heading text-lg font-semibold">
                    Today&apos;s Dining Register
                  </CardTitle>
                  <CardDescription>
                    {format(parseISO(date), 'MMMM dd, yyyy')} — Officers Dining Hall
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {registerBadge ? (
                    <Badge variant={registerBadge.variant} className="font-mono text-xs">
                      {registerBadge.label}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-mono text-xs">
                      No kitchen log
                    </Badge>
                  )}
                  <Badge
                    variant={dinerToday.isAttendingDay ? 'outline' : 'destructive'}
                    className="font-mono text-xs"
                  >
                    {dinerToday.isAttendingDay ? 'Present on Day Roll' : 'Marked Absent'}
                  </Badge>
                  <RegisterActions
                    unitId={unitId}
                    date={date}
                    status={registerStatus}
                    canSubmit={canWriteAttendance}
                    canApprove={canApproveRegister}
                  />
                </div>
              </div>
              {registerStatus === 'rejected' && expenditure?.reject_reason && (
                <p className="text-xs text-destructive">Rejected: {expenditure.reject_reason}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {dinerToday.meals.map((meal) => {
                const Icon = MEAL_ICONS[meal.mealType] ?? Utensils;
                const mealBadge = meal.isCut
                  ? { label: 'Cut', variant: 'destructive' as const }
                  : meal.isRequested
                    ? { label: 'Requested', variant: 'warning' as const }
                    : { label: 'Registered', variant: 'success' as const };
                return (
                  <div
                    key={meal.mealType}
                    className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-background/50 p-4 transition-all hover:bg-background/80 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-1 rounded-md bg-muted p-2.5 text-muted-foreground">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium capitalize text-foreground">
                            {meal.label}
                          </span>
                          <Badge variant={mealBadge.variant} className="px-1.5 py-0 text-[10px]">
                            {mealBadge.label}
                          </Badge>
                          {!isPRegister && meal.rate > 0 && (
                            <span className="font-mono text-xs text-muted-foreground">
                              ₹{meal.rate.toFixed(2)}
                            </span>
                          )}
                        </div>
                        {meal.cutReason && (
                          <p className="text-xs text-muted-foreground">{meal.cutReason}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      <MealCutToggle
                        unitId={unitId}
                        date={date}
                        mealType={meal.mealType}
                        cutStatus={meal.cutStatus}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                Your recent messing
              </CardTitle>
              <CardDescription>Official cut notices recorded for billing deduction</CardDescription>
            </CardHeader>
            <CardContent>
              {recentCuts.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No recent messing on record.</p>
              ) : (
                <div className="divide-y divide-border">
                  {recentCuts.map((cut) => (
                    <div key={cut.id} className="flex items-center justify-between py-3 text-sm">
                      <div className="space-y-0.5">
                        <span className="font-medium capitalize text-foreground">
                          {cut.meal_type}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(cut.cut_date), 'dd MMM yyyy')}
                          {cut.reason ? ` • ${cut.reason}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize">
                        {cut.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border bg-gradient-to-br from-primary/5 via-transparent to-transparent">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                Today&apos;s Messing Status
              </CardTitle>
              <CardDescription>
                {isPRegister ? 'Calculated via P-Register cost sharing' : 'Accumulated flat meal rates'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  Estimated Today Charge
                </span>
                <p className="mt-1 font-mono text-3xl font-bold text-foreground">
                  ₹{dinerToday.estimatedDailyCharge.toFixed(2)}
                </p>
                {isPRegister && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dinerToday.todayPRate != null && dinerToday.todayPRate > 0
                      ? `Today's P_d is finalized at ₹${dinerToday.todayPRate.toFixed(2)}`
                      : 'P-rate pending finalized attendance'}
                  </p>
                )}
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cycle Day Status:</span>
                  <span className="font-medium text-foreground">
                    {dinerToday.isAttendingDay ? 'Attending' : 'Absent'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diners on Roll:</span>
                  <span className="font-mono font-medium text-foreground">{presentCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                Cycle MTD
              </CardTitle>
              <CardDescription>Billing period progress and estimated dues</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!cycleMtd ? (
                <p className="text-xs text-muted-foreground">
                  No open, draft, or published billing period for this unit.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{cycleMtd.periodName}</span>
                    <Badge variant="outline" className="font-mono text-[10px] capitalize">
                      {cycleMtd.periodStatus}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    Day {cycleMtd.daysElapsed} of {cycleMtd.daysInPeriod}
                  </p>
                  <div>
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      Estimated cycle total
                    </span>
                    <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                      {cycleMtd.estimatedCycleTotal != null
                        ? `₹${cycleMtd.estimatedCycleTotal.toFixed(2)}`
                        : '—'}
                    </p>
                    {cycleMtd.estimatedCycleTotal == null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Estimate unavailable; period progress is shown above.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                Casual Guest Dining
              </CardTitle>
              <CardDescription>Guests hosted in the dining hall</CardDescription>
            </CardHeader>
            <CardContent>
              {guestMeals.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  No casual dining guests logged this cycle.
                </p>
              ) : (
                <div className="divide-y divide-border text-xs">
                  {guestMeals.slice(0, 5).map((gm) => (
                    <div key={gm.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <span className="font-medium capitalize text-foreground">
                          {gm.guest_count} guest(s) • {gm.meal_type}
                        </span>
                        <p className="text-muted-foreground">
                          {format(parseISO(gm.meal_date), 'dd MMM')}
                          {gm.guest_names ? ` • ${gm.guest_names}` : ''}
                        </p>
                      </div>
                      <span className="font-mono font-semibold text-foreground">
                        ₹{Number(gm.total_amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
