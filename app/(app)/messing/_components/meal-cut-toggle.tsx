'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { recordMealCutAction, cancelMealCutAction } from '@/lib/messing/actions';
import type { MessingMealType } from '@/lib/schemas/messing';
import { X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface MealCutToggleProps {
  unitId: string;
  date: string;
  mealType: MessingMealType;
  isCut: boolean;
}

export function MealCutToggle({ unitId, date, mealType, isCut }: MealCutToggleProps) {
  const [isPending, startTransition] = useTransition();

  const handleCut = () => {
    startTransition(async () => {
      const res = await recordMealCutAction({
        unit_id: unitId,
        cut_date: date,
        meal_type: mealType,
        reason: 'Officer self-service cut',
      });
      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Meal cut logged for ${mealType}`);
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

  if (isCut) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleCancelCut}
        className="h-8 gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5"
      >
        <Check className="size-3.5" />
        Restore Meal
      </Button>
    );
  }

  return (
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
  );
}
