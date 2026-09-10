'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { recordMealCutAction, cancelMealCutAction } from '@/lib/messing/actions';
import type { MessingMealType } from '@/lib/schemas/messing';
import type { MealCutStatus } from '@/lib/messing/types';
import { X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface MealCutToggleProps {
  unitId: string;
  date: string;
  mealType: MessingMealType;
  cutStatus?: MealCutStatus | null;
}

export function MealCutToggle({ unitId, date, mealType, cutStatus }: MealCutToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const isActive = cutStatus === 'approved' || cutStatus === 'requested';

  const handleCut = () => {
    startTransition(async () => {
      const res = await recordMealCutAction({
        unit_id: unitId,
        cut_date: date,
        meal_type: mealType,
        reason: reason.trim() || undefined,
      });
      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Meal cut logged for ${mealType}`);
        setReason('');
      }
    });
  };

  const handleCancelCut = () => {
    startTransition(async () => {
      const res = await cancelMealCutAction({
        unit_id: unitId,
        cut_date: date,
        meal_type: mealType,
      });
      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Meal restored for ${mealType}`);
      }
    });
  };

  if (isActive) {
    return (
      <div className="flex items-center gap-2">
        {cutStatus === 'requested' && (
          <Badge variant="warning" className="text-[10px]">
            Requested
          </Badge>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleCancelCut}
          className="h-8 gap-1.5 text-xs"
        >
          <Check className="size-3.5" />
          Restore Meal
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        maxLength={300}
        className="h-8 w-36 text-xs"
        disabled={isPending}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleCut}
        className="h-8 gap-1.5 text-xs text-destructive border-destructive/20 hover:bg-destructive/5"
      >
        <X className="size-3.5" />
        Place Meal Cut
      </Button>
    </div>
  );
}
