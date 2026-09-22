import Link from 'next/link';
import { format } from 'date-fns';
import { BedDouble, Receipt, Wheat, Wine, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { UnitReportSnapshot } from '@/lib/reports/types';

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatDay(iso: string) {
  return format(parseIsoDate(iso), 'dd MMM yyyy');
}

function inr(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(value: number) {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function KpiCards({
  periodStart,
  periodEnd,
  barSalesTotal,
  rationNetQty,
  rationNetAmount,
  guestRoomRevenue,
  outstandingDues,
  outstandingCount,
}: UnitReportSnapshot) {
  const hasDues = outstandingCount > 0 || outstandingDues > 0;
  const periodLabel = `${formatDay(periodStart)} – ${formatDay(periodEnd)}`;

  const cells: Array<{
    title: string;
    href: string;
    icon: LucideIcon;
    value: string;
    hint: string;
    badge?: { label: string; variant: 'warning' | 'success' };
  }> = [
    {
      title: 'Bar sales',
      href: '/bar',
      icon: Wine,
      value: inr(barSalesTotal),
      hint: 'Finalized member chits',
    },
    {
      title: 'Ration net',
      href: '/ration',
      icon: Wheat,
      value: inr(rationNetAmount),
      hint: `${qty(rationNetQty)} units issued − returned`,
    },
    {
      title: 'Guest rooms',
      href: '/guest-rooms',
      icon: BedDouble,
      value: inr(guestRoomRevenue),
      hint: 'Paid and transferred folios',
    },
    {
      title: 'Outstanding dues',
      href: '/billing',
      icon: Receipt,
      value: inr(outstandingDues),
      hint: hasDues
        ? `${outstandingCount} unpaid ${outstandingCount === 1 ? 'bill' : 'bills'}`
        : 'No unpaid bills',
      badge: { label: hasDues ? 'Dues open' : 'Cleared', variant: hasDues ? 'warning' : 'success' },
    },
  ];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="report-kpis-heading">
      <div>
        <h2
          id="report-kpis-heading"
          className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground"
        >
          Unit snapshot
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{periodLabel}</p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        {cells.map((cell) => {
          const Icon = cell.icon;
          return (
            <Link
              key={cell.title}
              href={cell.href}
              className="flex flex-col gap-2 bg-card p-4 transition-ds hover:bg-muted/40 active:bg-muted/60 focus-visible:bg-muted/40"
            >
              <p className="inline-flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Icon className="size-3.5" aria-hidden />
                {cell.title}
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-foreground tabular">
                {cell.value}
              </p>
              <p className="text-xs text-muted-foreground">{cell.hint}</p>
              {cell.badge ? (
                <Badge variant={cell.badge.variant} className="w-fit font-mono text-[10px]">
                  {cell.badge.label}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
