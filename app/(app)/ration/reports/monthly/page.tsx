import { requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { getRationMonthlyReport, parseReportMonth } from '@/lib/ration/reports';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MonthSelector } from './_components/month-selector';
import { CsvDownloadButton } from './_components/csv-download-button';

export const dynamic = 'force-dynamic';

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export default async function RationMonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  await requireCapability('ration.read', user.activeUnitId ?? undefined);

  if (!user.activeUnitId) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Monthly ration report
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dining strength and consumption by item for the selected month.
          </p>
        </header>
        <EmptyState
          title="Pick a unit to continue"
          description="You're in all-units mode. Use the unit switcher in the navbar to choose a unit and view its monthly report."
        />
      </section>
    );
  }

  const { month: monthParam } = await searchParams;
  const month = parseReportMonth(monthParam);
  const unitId = user.activeUnitId;
  const report = await getRationMonthlyReport(unitId, month);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Monthly ration report
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Present count and posted consumption by item for{' '}
            {monthLabel(month)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelector month={month} />
          <CsvDownloadButton unitId={unitId} month={month} />
        </div>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-card px-4 py-3 shadow-xs ring-1 ring-foreground/10">
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recorded days
          </dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {report.recorded_days}
          </dd>
        </div>
        <div className="rounded-xl bg-card px-4 py-3 shadow-xs ring-1 ring-foreground/10">
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total present
          </dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {report.total_present}
          </dd>
        </div>
        <div className="rounded-xl bg-card px-4 py-3 shadow-xs ring-1 ring-foreground/10">
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Average present
          </dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {report.average_present ?? '—'}
          </dd>
        </div>
      </dl>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Present count
          </h2>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {report.finalized_days} finalized
          </Badge>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Present count</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.days.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No attendance recorded this month.
                  </TableCell>
                </TableRow>
              ) : (
                report.days.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell className="font-mono text-sm">{day.date}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {day.present_count}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          day.status === 'finalized' ? 'success' : 'secondary'
                        }
                      >
                        {day.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Consumption by item
        </h2>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Days posted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.variants.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No ration consumption posted this month.
                  </TableCell>
                </TableRow>
              ) : (
                report.variants.map((row) => (
                  <TableRow key={row.variant_id}>
                    <TableCell className="font-semibold">{row.item_name}</TableCell>
                    <TableCell>{row.uom}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {row.quantity.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {row.days_posted}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
