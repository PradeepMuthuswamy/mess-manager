'use client';

import { CustomCheckbox } from './custom-checkbox';
import { cn } from '@/lib/utils';

interface AssignmentCardProps {
  label: string;
  description: string;
  isChecked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function AssignmentCard({
  label,
  description,
  isChecked,
  onCheckedChange,
}: AssignmentCardProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-md border p-2 transition-all cursor-pointer hover:bg-muted/35 select-none",
        isChecked
          ? "bg-primary/5 border-primary/20 text-foreground"
          : "bg-background border-border/60 text-muted-foreground"
      )}
    >
      <CustomCheckbox
        checked={isChecked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="text-[11px] leading-normal text-muted-foreground">{description}</span>
      </div>
    </label>
  );
}
