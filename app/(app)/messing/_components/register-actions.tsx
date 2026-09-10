'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  submitDailyRegisterAction,
  approveDailyRegisterAction,
  rejectDailyRegisterAction,
} from '@/lib/messing/actions';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface RegisterActionsProps {
  unitId: string;
  date: string;
  status: string | null;
  canSubmit: boolean;
  canApprove: boolean;
}

export function RegisterActions({
  unitId,
  date,
  status,
  canSubmit,
  canApprove,
}: RegisterActionsProps) {
  const [isPending, startTransition] = useTransition();

  const payload = { unit_id: unitId, expenditure_date: date };

  const run = (fn: () => Promise<{ ok: true } | { error: string }>, success: string) => {
    startTransition(async () => {
      const res = await fn();
      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(success);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSubmit && status === 'draft' && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => run(() => submitDailyRegisterAction(payload), 'Register submitted')}
        >
          {isPending && <Loader2 className="size-4 animate-spin" />}
          Submit register
        </Button>
      )}
      {canApprove && status === 'submitted' && (
        <>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => run(() => approveDailyRegisterAction(payload), 'Register approved')}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              const reason = window.prompt('Reject reason (optional)');
              if (reason === null) return;
              run(
                () =>
                  rejectDailyRegisterAction({
                    ...payload,
                    reject_reason: reason.trim() || undefined,
                  }),
                'Register rejected',
              );
            }}
          >
            Reject
          </Button>
        </>
      )}
    </div>
  );
}
