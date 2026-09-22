import Link from 'next/link';
import { Wine, BedDouble, ClipboardList, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type DutyDeskItem = {
  href: string;
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: 'default' | 'warning' | 'info';
};

export function DutyDesk({ items }: { items: DutyDeskItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="duty-desk-heading">
      <h2
        id="duty-desk-heading"
        className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground"
      >
        Duty desk
      </h2>
      <div
        className={cn(
          'grid gap-px overflow-hidden rounded-xl border border-border bg-border shadow-xs',
          items.length === 1 && 'grid-cols-1',
          items.length === 2 && 'grid-cols-2',
          items.length === 3 && 'grid-cols-1 sm:grid-cols-3',
          items.length >= 4 && 'grid-cols-2 xl:grid-cols-4',
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="flex flex-col gap-2 bg-card p-4 transition-ds hover:bg-muted/40 active:bg-muted/60 focus-visible:bg-muted/40"
            >
              <p className="inline-flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Icon className="size-3.5" aria-hidden />
                {item.label}
              </p>
              <p className="font-mono text-2xl font-bold tracking-tight text-foreground tabular">
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground">{item.hint}</p>
              {item.tone && item.tone !== 'default' ? (
                <Badge variant={item.tone} className="w-fit font-mono text-[10px]">
                  {item.tone === 'warning' ? 'Needs action' : 'Today'}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export const DutyIcons = {
  Wine,
  BedDouble,
  ClipboardList,
};
