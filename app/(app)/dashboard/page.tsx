import { requireUser } from '@/lib/auth/require-role';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, Coffee, ReceiptText, ShieldCheck, Flame, Utensils, Compass, GraduationCap, Clock } from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage() {
  const user = await requireUser();

  // Premium Officer Role/Rank simulation
  const mockRank = user.role === 'admin' ? 'Colonel' : user.role === 'unit_admin' ? 'Lieutenant Colonel' : 'Major';
  const mockDinerId = `OM-${user.email.slice(0, 3).toUpperCase()}-402`;

  const todayMeals = [
    { name: 'Breakfast', time: '07:30 - 09:30', menu: 'Poached Eggs, Toast, Fresh Tea', status: 'Attended', icon: Coffee, active: false },
    { name: 'Lunch', time: '12:30 - 14:30', menu: 'Roasted Herb Chicken & Salad', status: 'Registered (Auto)', icon: Utensils, active: true },
    { name: 'Dinner', time: '19:30 - 21:30', menu: 'Grilled Salmon & Soufflé', status: 'Cut Requested', icon: Flame, active: false },
  ];

  const activeBookings = [
    { room: 'VVIP Suite 302', checkIn: 'May 28', checkOut: 'Jun 02', status: 'Checked In' },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-8">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <Compass className="size-3.5 animate-spin-slow" /> Exclusive Officer Portal
            </span>
            <h1 className="text-3xl font-black font-heading tracking-tight text-foreground md:text-4xl">
              Welcome back, {mockRank} {user.displayName ?? user.email.split('@')[0]}
            </h1>
            <p className="max-w-xl text-xs text-muted-foreground leading-relaxed">
              Serving our officers with pristine hospitality, fine messing, and luxury guest quarters. All operational controls have been streamlined for a focused member experience.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/messing">
              <Button size="sm" variant="default" className="shadow-xs transition-ds hover:opacity-95">
                Messing Control
              </Button>
            </Link>
            <Link href="/guest-rooms">
              <Button size="sm" variant="outline">
                Book a Room
              </Button>
            </Link>
          </div>
        </div>
        <div className="absolute top-0 right-0 -mr-16 -mt-16 size-64 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Mess Profile/Badge Card */}
        <Card className="border-border bg-gradient-to-b from-card to-background relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-primary to-amber-600" />
          <CardHeader className="pb-4">
            <CardTitle className="font-heading text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Officer Mess Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                <GraduationCap className="size-6" />
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-[8px] text-success-foreground font-black ring-2 ring-background">
                  ✓
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-mono">{mockDinerId}</span>
                <p className="font-heading font-bold text-foreground text-base">
                  {mockRank} {user.displayName ?? user.email.split('@')[0]}
                </p>
                <div className="flex gap-1.5 mt-1 items-center flex-wrap">
                  <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 text-[9px] font-mono py-0">
                    GOLD MEMBER
                  </Badge>
                  <Badge variant="secondary" className="text-[9px] font-mono py-0">
                    Active Unit Diner
                  </Badge>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block mb-0.5">Mess Bill Auto-Pay</span>
                <span className="font-medium text-success flex items-center gap-1">
                  Active (Payroll Linked)
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Assigned Unit</span>
                <span className="font-medium text-foreground">
                  {user.isAllUnits ? 'All Units' : (user.activeUnitId ? `Unit Scoped` : '1st Regt Mess')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Dues Summary */}
        <Card className="border-border relative">
          <CardHeader className="pb-4">
            <CardTitle className="font-heading text-xs font-semibold tracking-wider text-muted-foreground uppercase flex justify-between items-center">
              Outstanding Dues
              <Link href="/billing" className="text-[10px] text-primary hover:underline font-mono normal-case">
                View Ledger
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Due by 10 Jun 2026</span>
              <p className="text-3xl font-black font-mono tracking-tight text-foreground">₹24,350.00</p>
              <div className="text-[10px] text-destructive flex items-center gap-1 font-medium bg-destructive/5 border border-destructive/15 rounded px-2 py-0.5 w-fit mt-1">
                Settles in next salary cycle
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block mb-0.5">Dining Fees</span>
                <span className="font-semibold text-foreground font-mono">₹14,850.00</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Room & Lodging</span>
                <span className="font-semibold text-foreground font-mono">₹9,500.00</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Guest Room Booking */}
        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="font-heading text-xs font-semibold tracking-wider text-muted-foreground uppercase flex justify-between items-center">
              Guest Quarters
              <Link href="/guest-rooms" className="text-[10px] text-primary hover:underline font-mono normal-case">
                New Booking
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeBookings.map((b, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{b.room}</span>
                  <Badge variant="default" className="text-[9px] py-0 px-1.5 font-mono">
                    {b.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  <div>
                    <span className="block text-[9px] uppercase tracking-wide font-mono">Check-In Date</span>
                    <span className="font-medium text-foreground">{b.checkIn}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase tracking-wide font-mono">Check-Out Date</span>
                    <span className="font-medium text-foreground">{b.checkOut}</span>
                  </div>
                </div>
              </div>
            ))}
            {activeBookings.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-muted-foreground">
                <CalendarDays className="size-8 text-muted-foreground/30 mb-2" />
                No active suite bookings this week.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Quick Dining Tracker */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold font-heading text-foreground uppercase tracking-wide flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" /> Today's Dining Ledger
          </h2>
          <Card className="border-border">
            <CardContent className="p-0 divide-y divide-border">
              {todayMeals.map((m, idx) => {
                const Icon = m.icon;
                return (
                  <div key={idx} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-4.5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{m.name}</span>
                          <span className="text-[10px] text-muted-foreground">({m.time})</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{m.menu}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={m.status === 'Attended' ? 'success' : m.status === 'Cut Requested' ? 'destructive' : 'secondary'} className="text-[9px] py-0">
                        {m.status}
                      </Badge>
                      {m.active && (
                        <Link href="/messing">
                          <Button size="xs" variant="outline" className="h-6 text-[10px]">
                            Check-In
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Mess Bulletins / Announcements */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold font-heading text-foreground uppercase tracking-wide flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" /> Mess Bulletins
          </h2>
          <Card className="border-border bg-card/40">
            <CardContent className="p-4 space-y-4 text-xs text-muted-foreground">
              <div className="space-y-1">
                <span className="font-bold text-foreground block">1. Dining Dress Protocol</span>
                <p className="leading-relaxed text-[11px]">
                  Formal uniforms or formal service attire is mandatory after 18:30 in the Regimental Dining Hall. Casual smartwear is restricted.
                </p>
              </div>
              <div className="h-px bg-border" />
              <div className="space-y-1">
                <span className="font-bold text-foreground block">2. Annual Regimental Night</span>
                <p className="leading-relaxed text-[11px]">
                  Reservations for the upcoming Guest Dining Night on June 12 are now open. Register guest counts through the messing portal early.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
