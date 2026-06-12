import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Coffee, Utensils, Check, X, Calendar, Flame, AlertCircle } from 'lucide-react';

export default async function MessingPage() {
  await requireCapability('attendance.read');
  const user = await requireUser();

  // Mock data for the premium officer experience
  const todayMeals = [
    {
      id: 'breakfast',
      name: 'Breakfast',
      time: '07:30 - 09:30',
      icon: Coffee,
      menu: 'Poached Eggs, Grilled Tomatoes, Toast, Fresh Juice, Tea/Coffee',
      status: 'attended',
      statusLabel: 'Attended',
      badgeColor: 'success' as const,
    },
    {
      id: 'lunch',
      name: 'Lunch',
      time: '12:30 - 14:30',
      icon: Utensils,
      menu: 'Roasted Herb Chicken, Quinoa Salad, Sautéed Asparagus, Fruit Tart',
      status: 'pending',
      statusLabel: 'Registered (Auto)',
      badgeColor: 'info' as const,
    },
    {
      id: 'dinner',
      name: 'Dinner',
      time: '19:30 - 21:30',
      icon: Flame,
      menu: 'Grilled Salmon Fillet, Roasted Fingerling Potatoes, Soufflé',
      status: 'cut',
      statusLabel: 'Meal Cut Requested',
      badgeColor: 'destructive' as const,
    },
  ];

  const recentCuts = [
    { date: '2026-05-28', meal: 'Dinner', status: 'Approved', savings: '₹350.00' },
    { date: '2026-05-29', meal: 'Lunch & Dinner', status: 'Approved', savings: '₹600.00' },
    { date: '2026-05-30', meal: 'Dinner', status: 'Pending', savings: '₹350.00' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary mb-1">
            Officer Portal
          </p>
          <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
            Messing & Dining
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register daily meals, manage mess cuts, and review dining ledgers.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main interactive meal register */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border bg-card/60 backdrop-blur-xs">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-heading text-lg font-semibold">Today&apos;s Dining Register</CardTitle>
                  <CardDescription>May 30, 2026 — Officers Dining Hall</CardDescription>
                </div>
                <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">
                  Regular Diner
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {todayMeals.map((meal) => {
                const Icon = meal.icon;
                return (
                  <div
                    key={meal.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-background/50 hover:bg-background/80 transition-all gap-4"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 rounded-md bg-muted text-muted-foreground mt-1">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{meal.name}</span>
                          <span className="text-xs text-muted-foreground">({meal.time})</span>
                          <Badge
                            variant={
                              meal.status === 'attended'
                                ? 'success'
                                : meal.status === 'cut'
                                ? 'destructive'
                                : 'info'
                            }
                            className="text-[10px] px-1.5 py-0"
                          >
                            {meal.statusLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground max-w-md">{meal.menu}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      {meal.status === 'pending' && (
                        <>
                          <Button size="xs" variant="outline" className="h-8 gap-1.5 text-xs text-destructive border-destructive/20 hover:bg-destructive/5">
                            <X className="size-3" /> Request Cut
                          </Button>
                          <Button size="xs" variant="default" className="h-8 gap-1.5 text-xs">
                            <Check className="size-3" /> Confirm Attendance
                          </Button>
                        </>
                      )}
                      {meal.status === 'attended' && (
                        <div className="text-xs text-success flex items-center gap-1 font-medium bg-success/5 border border-success/15 rounded-md px-2.5 py-1">
                          <Check className="size-3.5" /> Checked In
                        </div>
                      )}
                      {meal.status === 'cut' && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 font-medium bg-muted border border-border rounded-md px-2.5 py-1">
                          <X className="size-3.5 text-destructive" /> Cut Registered
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Mess cuts request history */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-heading text-lg font-semibold">Active Mess Cuts</CardTitle>
                <CardDescription>Cuts must be requested 24 hours in advance.</CardDescription>
              </div>
              <Button size="sm" variant="outline">
                <Calendar className="mr-1.5 size-4" /> Request Future Cut
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-muted-foreground font-medium">
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Meal Session</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-right">Savings Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentCuts.map((cut, idx) => (
                      <tr key={idx} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-foreground">{cut.date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{cut.meal}</td>
                        <td className="px-4 py-3">
                          <Badge variant={cut.status === 'Approved' ? 'success' : 'secondary'} className="text-[10px] px-1.5 py-0">
                            {cut.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-foreground">{cut.savings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Cards */}
        <div className="space-y-6">
          <Card className="border-border bg-primary/5">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">Mess Summary</CardTitle>
              <CardDescription>Current billing cycle metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Total Diner Meals</span>
                <p className="text-2xl font-bold font-mono tracking-tight text-foreground">78 / 90</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Total Cuts Approved</span>
                <p className="text-2xl font-bold font-mono tracking-tight text-success">12 Meals</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Accumulated Rebate Credit</span>
                <p className="text-2xl font-bold font-mono tracking-tight text-foreground">₹4,200.00</p>
              </div>
              <div className="h-px bg-border my-2" />
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Estimated Messing Dues</span>
                <p className="text-2xl font-bold font-mono tracking-tight text-primary">₹14,850.00</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold flex items-center gap-2">
                <AlertCircle className="size-4 text-primary" /> Mess Protocol
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3 leading-relaxed">
              <p>
                <strong>Dress Code:</strong> Formal Uniform or Smart Casual is mandatory after 18:30 in the dining and lounge areas.
              </p>
              <p>
                <strong>Meal Cuts:</strong> All breakfast cuts must be requested before 18:00 the prior evening. Lunch and dinner cuts require 24 hours advance request.
              </p>
              <p>
                <strong>Guests:</strong> Officers may host up to 4 guests in the dining room with prior registry entry. Guest meals will be charged at standard guest tariffs.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
