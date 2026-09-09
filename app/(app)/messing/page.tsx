import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Coffee, Utensils, Flame, Users, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  getDinerTodayStatus,
  getDailyExpenditure,
  getMemberMealCuts,
  listGuestMeals,
} from '@/lib/messing/queries';
import { getAttendanceDay } from '@/lib/attendance/queries';
import { MealCutToggle } from './_components/meal-cut-toggle';
import { KitchenExpenditureDialog } from './_components/kitchen-expenditure-dialog';
import { CasualGuestDialog } from './_components/casual-guest-dialog';
import { format, subDays, addDays } from 'date-fns';
import { EmptyState } from '@/components/shared/empty-state';

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

  const supabase = await createClient();
  const canWriteAttendance = userHasCapability(user, 'attendance.write', unitId);

  // Fetch real attendance present count for P-rate calculation
  let presentCount = 0;
  try {
    const attendance = await getAttendanceDay(unitId, date, supabase);
    presentCount = attendance.present_count;
  } catch {
    presentCount = 0;
  }

  const startDate = format(subDays(new Date(date), 30), 'yyyy-MM-dd');
  const endDate = format(addDays(new Date(date), 30), 'yyyy-MM-dd');

  // Parallel data fetching
  const [dinerToday, expenditure, recentCuts, guestMeals] = await Promise.all([
    getDinerTodayStatus(unitId, user.id, date),
    getDailyExpenditure(unitId, date),
    getMemberMealCuts(unitId, user.id, startDate, endDate),
    listGuestMeals(unitId, startDate, endDate, user.id),
  ]);

  const isPRegister = dinerToday.billingMode === 'P_REGISTER_SPLIT';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
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
          <p className="text-sm text-muted-foreground mt-1">
            Manage daily meals, place advance mess cuts, and review dining charges.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main interactive meal register */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border bg-card/60 backdrop-blur-xs">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-heading text-lg font-semibold">
                    Today&apos;s Dining Register
                  </CardTitle>
                  <CardDescription>
                    {format(new Date(date), 'MMMM dd, yyyy')} — Officers Dining Hall
                  </CardDescription>
                </div>
                <Badge
                  variant={dinerToday.isAttendingDay ? 'outline' : 'destructive'}
                  className="font-mono text-xs"
                >
                  {dinerToday.isAttendingDay ? 'Present on Day Roll' : 'Marked Absent'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {dinerToday.meals.map((meal) => {
                const Icon = MEAL_ICONS[meal.mealType] ?? Utensils;
                return (
                  <div
                    key={meal.mealType}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-background/50 hover:bg-background/80 transition-all gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 rounded-md bg-muted text-muted-foreground mt-1">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground capitalize">
                            {meal.label}
                          </span>
                          <Badge
                            variant={meal.isCut ? 'destructive' : 'success'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {meal.isCut ? 'Meal Cut' : 'Registered'}
                          </Badge>
                          {!isPRegister && meal.rate > 0 && (
                            <span className="text-xs font-mono text-muted-foreground">
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
                        isCut={meal.isCut}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Recent Meal Cuts */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                Your Recent Meal Cuts
              </CardTitle>
              <CardDescription>Official cut notices recorded for billing deduction</CardDescription>
            </CardHeader>
            <CardContent>
              {recentCuts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No recent meal cuts on record.</p>
              ) : (
                <div className="divide-y divide-border">
                  {recentCuts.map((cut) => (
                    <div key={cut.id} className="py-3 flex items-center justify-between text-sm">
                      <div className="space-y-0.5">
                        <span className="font-medium text-foreground capitalize">
                          {cut.meal_type}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(cut.cut_date), 'dd MMM yyyy')}
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

        {/* Sidebar Cards */}
        <div className="space-y-6">
          {/* Today's Estimated Messing */}
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
                <span className="text-xs text-muted-foreground uppercase font-mono">
                  Estimated Today Charge
                </span>
                <p className="text-3xl font-bold font-mono text-foreground mt-1">
                  ₹{dinerToday.estimatedDailyCharge.toFixed(2)}
                </p>
                {isPRegister && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {dinerToday.todayPRate != null
                      ? `Today's P_d is finalized at ₹${dinerToday.todayPRate.toFixed(2)}`
                      : 'Mess Havildar kitchen log pending for today'}
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
                  <span className="font-medium font-mono text-foreground">{presentCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Casual Guest Meals */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">
                Casual Guest Dining
              </CardTitle>
              <CardDescription>Guests hosted in the dining hall</CardDescription>
            </CardHeader>
            <CardContent>
              {guestMeals.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No casual dining guests logged this cycle.
                </p>
              ) : (
                <div className="divide-y divide-border text-xs">
                  {guestMeals.slice(0, 5).map((gm) => (
                    <div key={gm.id} className="py-2.5 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-foreground capitalize">
                          {gm.guest_count} guest(s) • {gm.meal_type}
                        </span>
                        <p className="text-muted-foreground">
                          {format(new Date(gm.meal_date), 'dd MMM')}
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
