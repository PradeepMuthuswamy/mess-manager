import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import { getDinerTodayStatus } from '@/lib/messing/queries';
import { getMyMessBills } from '@/lib/billing/queries';
import { listMyBarChits } from '@/lib/dashboard/member-queries';
import { listMyPartyCharges } from '@/lib/parties/queries';
import { getUnitReport } from '@/lib/reports/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { BarChart3 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { KpiCards } from './_components/kpi-cards';
import { PRateChart } from './_components/prate-chart';
import { ExportButton } from './_components/export-button';

export const dynamic = 'force-dynamic';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inr(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function loadPersonal(unitId: string, userId: string, date: string, since: string) {
  const [diner, bills, chits, charges] = await Promise.all([
    getDinerTodayStatus(unitId, userId, date).catch(() => null),
    getMyMessBills(userId).catch(() => []),
    listMyBarChits(unitId, userId, since).catch(() => []),
    listMyPartyCharges(unitId, userId).catch(() => []),
  ]);

  const unpaid = bills.filter((b) => b.status === 'published' || b.status === 'overdue');
  const paid = bills.filter((b) => b.status === 'paid');
  const barTotal = chits.reduce((sum, c) => sum + c.total_amount, 0);
  const partyPending = charges.filter((c) => !c.is_billed).reduce((sum, c) => sum + c.amount, 0);

  return { diner, unpaid, paid, barTotal, chits, partyPending };
}

function PersonalKpis({
  dinerCharge,
  isAttending,
  unpaidTotal,
  unpaidCount,
  barTotal,
  chitCount,
  partyPending,
}: {
  dinerCharge: number;
  isAttending: boolean;
  unpaidTotal: number;
  unpaidCount: number;
  barTotal: number;
  chitCount: number;
  partyPending: number;
}) {
  const cells = [
    {
      label: "Today's messing",
      value: inr(dinerCharge),
      hint: isAttending ? 'On the day roll' : 'Marked absent / no register',
    },
    {
      label: 'Unpaid mess bills',
      value: inr(unpaidTotal),
      hint: `${unpaidCount} open statement${unpaidCount === 1 ? '' : 's'}`,
    },
    {
      label: 'Bar (last 30 days)',
      value: inr(barTotal),
      hint: `${chitCount} chit${chitCount === 1 ? '' : 's'}`,
    },
    {
      label: 'Unbilled party charges',
      value: inr(partyPending),
      hint: 'Will appear on the next draft bill',
    },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border shadow-xs sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-2 bg-card p-4">
          <p className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {cell.label}
          </p>
          <p className="font-mono text-2xl font-bold tracking-tight text-foreground tabular">
            {cell.value}
          </p>
          <p className="text-xs text-muted-foreground">{cell.hint}</p>
        </div>
      ))}
    </div>
  );
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

  const canSeeUnit = userHasCapability(user, 'reports.unit', unitId);
  const personalPromise = loadPersonal(unitId, user.id, date, since);

  if (canSeeUnit) {
    const [snapshot, personal] = await Promise.all([
      getUnitReport(unitId, since, date).catch(() => null),
      personalPromise,
    ]);

    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-primary">Unit</p>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
              Unit report
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Last 30 days. Figures below are live — nothing here is sample data.
            </p>
          </div>
          {snapshot ? <ExportButton snapshot={snapshot} /> : null}
        </div>

        {snapshot ? (
          <>
            <KpiCards {...snapshot} />
            <PRateChart {...snapshot} />
          </>
        ) : (
          <EmptyState
            icon={<BarChart3 className="size-5" />}
            title="Unit report unavailable"
            description="Could not load this unit’s snapshot. Your personal figures are still below."
          />
        )}

        <section className="space-y-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-primary">Personal</p>
            <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
              Your account
            </h2>
          </div>
          <PersonalKpis
            dinerCharge={personal.diner?.estimatedDailyCharge ?? 0}
            isAttending={!!personal.diner?.isAttendingDay}
            unpaidTotal={personal.unpaid.reduce((s, b) => s + Number(b.total_amount), 0)}
            unpaidCount={personal.unpaid.length}
            barTotal={personal.barTotal}
            chitCount={personal.chits.length}
            partyPending={personal.partyPending}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/billing">Open bills</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/messing">Open messing</Link>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const personal = await personalPromise;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-primary">Personal</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
          My report
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Figures below are from your live account. Nothing here is sample data.
        </p>
      </div>

      <PersonalKpis
        dinerCharge={personal.diner?.estimatedDailyCharge ?? 0}
        isAttending={!!personal.diner?.isAttendingDay}
        unpaidTotal={personal.unpaid.reduce((s, b) => s + Number(b.total_amount), 0)}
        unpaidCount={personal.unpaid.length}
        barTotal={personal.barTotal}
        chitCount={personal.chits.length}
        partyPending={personal.partyPending}
      />

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base">Settled bills</CardTitle>
          <CardDescription>
            {personal.paid.length} paid statement{personal.paid.length === 1 ? '' : 's'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {personal.paid.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid bills yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {personal.paid.slice(0, 8).map((bill) => (
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
