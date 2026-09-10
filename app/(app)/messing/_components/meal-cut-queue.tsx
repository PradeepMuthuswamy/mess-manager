'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { approveMealCutAction, rejectMealCutAction } from '@/lib/messing/actions';
import { MESSING_MEAL_TYPE_LABEL, type MessingMealType } from '@/lib/schemas/messing';
import type { RequestedMealCutView } from '@/lib/messing/types';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function MealCutQueue({
  unitId,
  cuts,
}: {
  unitId: string;
  cuts: RequestedMealCutView[];
}) {
  const [isPending, startTransition] = useTransition();

  if (cuts.length === 0) {
    return <p className="text-sm text-muted-foreground">No meal-cut requests waiting.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {cuts.map((cut) => (
        <div key={cut.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{cut.memberName}</span>
              <Badge variant="warning" className="text-[10px] capitalize">
                requested
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {MESSING_MEAL_TYPE_LABEL[cut.meal_type as MessingMealType] ?? cut.meal_type}
              {' · '}
              {format(parseISO(cut.cut_date), 'dd MMM yyyy')}
              {cut.reason ? ` · ${cut.reason}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const res = await approveMealCutAction({ id: cut.id, unit_id: unitId });
                  if ('error' in res) toast.error(res.error);
                  else toast.success('Meal cut approved');
                });
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                const reason = window.prompt('Reject reason (optional)');
                if (reason === null) return;
                startTransition(async () => {
                  const res = await rejectMealCutAction({
                    id: cut.id,
                    unit_id: unitId,
                    reason: reason.trim() || undefined,
                  });
                  if ('error' in res) toast.error(res.error);
                  else toast.success('Meal cut rejected');
                });
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
