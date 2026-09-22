import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BedDouble, Receipt, Wheat, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type PresidentKpisProps = {
  outstandingTotal: number;
  unpaidCount: number;
  occupancyLabel: string;
  rationAlert: string | null;
};

function inr(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PresidentKpis({
  outstandingTotal,
  unpaidCount,
  occupancyLabel,
  rationAlert,
}: PresidentKpisProps) {
  const hasDues = unpaidCount > 0;
  const hasRationAlert = Boolean(rationAlert);

  const cells: Array<{
    title: string;
    href: string;
    icon: LucideIcon;
    value: string;
    hint: string;
    badge?: { label: string; variant: 'warning' | 'success' };
  }> = [
    {
      title: 'Outstanding dues',
      href: '/billing',
      icon: Receipt,
      value: inr(outstandingTotal),
      hint: hasDues
        ? `${unpaidCount} unpaid ${unpaidCount === 1 ? 'bill' : 'bills'}`
        : 'No unpaid bills',
      badge: { label: hasDues ? 'Dues open' : 'Cleared', variant: hasDues ? 'warning' : 'success' },
    },
    {
      title: 'Guest rooms',
      href: '/guest-rooms',
      icon: BedDouble,
      value: occupancyLabel,
      hint: 'Current occupancy',
    },
    {
      title: 'Ration stock',
      href: '/ration',
      icon: hasRationAlert ? AlertTriangle : Wheat,
      value: hasRationAlert ? rationAlert! : 'No stock alerts',
      hint: hasRationAlert ? 'Needs review' : 'Stock looks healthy',
      badge: {
        label: hasRationAlert ? 'Alert' : 'Healthy',
        variant: hasRationAlert ? 'warning' : 'success',
      },
    },
  ];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="president-kpis-heading">
      <h2
        id="president-kpis-heading"
        className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground"
      >
        Unit summary
      </h2>
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border shadow-xs sm:grid-cols-3">
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
              <p
                className={cn(
                  'font-semibold leading-snug tracking-tight text-foreground',
                  cell.value.startsWith('₹') ? 'font-mono text-2xl tabular' : 'text-lg',
                )}
              >
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
