'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DateSelector({ date }: { date: string }) {
  const router = useRouter();

  const handleChange = (newDate: string) => {
    if (newDate) {
      router.push(`/ration/consumption?date=${newDate}`);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-muted/30 p-1.5 px-3 rounded-lg border border-border shrink-0">
      <Label htmlFor="date-select" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
        Date
      </Label>
      <Input
        id="date-select"
        type="date"
        value={date}
        className="w-40 h-8 font-mono text-sm bg-background border-border"
        onChange={(e) => handleChange(e.target.value)}
      />
    </div>
  );
}
