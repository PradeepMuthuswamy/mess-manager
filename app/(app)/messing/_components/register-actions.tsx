'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { savingLabel } from '@/components/shared/save-submit';
import {
  submitDailyRegisterAction,
  approveDailyRegisterAction,
  rejectDailyRegisterAction,
} from '@/lib/messing/actions';
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
  const [busy, setBusy] = useState<string | null>(null);

  const payload = { unit_id: unitId, expenditure_date: date };

  const run = (
    key: string,
    fn: () => Promise<{ ok: true } | { error: string }>,
    success: string,
  ) => {
    setBusy(key);
    startTransition(async () => {
      try {
        const res = await fn();
        if ('error' in res) {
          toast.error(res.error);
        } else {
          toast.success(success);
        }
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSubmit && status === 'draft' && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => run('submit', () => submitDailyRegisterAction(payload), 'Register submitted')}
        >
          {savingLabel(busy === 'submit', 'Submit register')}
        </Button>
      )}
      {canApprove && status === 'submitted' && (
        <>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => run('approve', () => approveDailyRegisterAction(payload), 'Register approved')}
          >
            {savingLabel(busy === 'approve', 'Approve')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              const reason = window.prompt('Reject reason (optional)');
              if (reason === null) return;
              run(
                'reject',
                () =>
                  rejectDailyRegisterAction({
                    ...payload,
                    reject_reason: reason.trim() || undefined,
                  }),
                'Register rejected',
              );
            }}
          >
            {savingLabel(busy === 'reject', 'Reject')}
          </Button>
        </>
      )}
    </div>
  );
}
