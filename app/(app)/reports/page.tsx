import { requireUser } from '@/lib/auth/require-role';
import { getDinerTodayStatus } from '@/lib/messing/queries';
import { getMyMessBills } from '@/lib/billing/queries';
import { listMyBarChits } from '@/lib/dashboard/member-queries';
import { listMyPartyCharges } from '@/lib/parties/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { BarChart3 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inr(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function ReportsPage() {
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;
  const date = todayIso();
  const since = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  if (!unitId) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-5" />}
        title="No active unit"
        description="Assign a unit to see your personal report."
      />
    );
  }

  const [diner, bills, chits, charges] = await Promise.all([
    getDinerTodayStatus(unitId, user.id, date).catch(() => null),
    getMyMessBills(user.id).catch(() => []),
    listMyBarChits(unitId, user.id, since).catch(() => []),
    listMyPartyCharges(unitId, user.id).catch(() => []),
  ]);

  const unpaid = bills.filter((b) => b.status === 'published' || b.status === 'overdue');
  const paid = bills.filter((b) => b.status === 'paid');
  const barTotal = chits.reduce((sum, c) => sum + c.total_amount, 0);
  const partyPending = charges.filter((c) => !c.is_billed).reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-primary">Personal</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
          My report
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Figures below are from your live account. Nothing here is sample data.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription>Today&apos;s messing</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {inr(diner?.estimatedDailyCharge ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {diner?.isAttendingDay ? 'On the day roll' : 'Marked absent / no register'}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription>Unpaid mess bills</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {inr(unpaid.reduce((s, b) => s + Number(b.total_amount), 0))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {unpaid.length} open statement{unpaid.length === 1 ? '' : 's'}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription>Bar (last 30 days)</CardDescription>
            <CardTitle className="font-mono text-2xl">{inr(barTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {chits.length} chit{chits.length === 1 ? '' : 's'}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardDescription>Unbilled party charges</CardDescription>
            <CardTitle className="font-mono text-2xl">{inr(partyPending)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Will appear on the next draft bill
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base">Settled bills</CardTitle>
          <CardDescription>{paid.length} paid statement{paid.length === 1 ? '' : 's'}</CardDescription>
        </CardHeader>
        <CardContent>
          {paid.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid bills yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {paid.slice(0, 8).map((bill) => (
                <li key={bill.id} className="flex justify-between py-2">
                  <span className="font-mono">{bill.bill_number}</span>
                  <span className="font-mono">{inr(Number(bill.total_amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href="/billing">Open bills</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/messing">Open messing</Link>
        </Button>
      </div>
    </div>
  );
}
