'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MonthSelector({ month }: { month: string }) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-1.5 shrink-0">
      <Label
        htmlFor="month-select"
        className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Month
      </Label>
      <Input
        id="month-select"
        type="month"
        value={month}
        className="h-8 w-44 bg-background font-mono text-sm border-border"
        onChange={(e) => {
          if (e.target.value) {
            router.push(`/ration/reports/monthly?month=${e.target.value}`);
          }
        }}
      />
    </div>
  );
}
