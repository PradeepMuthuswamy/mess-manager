'use client';

import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CustomCheckboxProps {
  id?: string;
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function CustomCheckbox({
  id,
  checked,
  onCheckedChange,
  className,
  disabled,
}: CustomCheckboxProps) {
  const isChecked = checked === true;
  const isIndeterminate = checked === 'indeterminate';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onCheckedChange(!isChecked);
  };

  return (
    <button
      id={id}
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
        (isChecked || isIndeterminate)
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-transparent hover:bg-muted/10",
        className
      )}
    >
      {isChecked && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
      {isIndeterminate && <Minus className="size-3 text-primary-foreground" strokeWidth={3} />}
    </button>
  );
}
