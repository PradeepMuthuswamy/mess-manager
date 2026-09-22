'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  approvePartyBudgetAction,
  finalizePartyAction,
  submitPartyBudgetAction,
} from '@/lib/parties/actions';
import type { PartyBudgetStatus } from '@/lib/parties/types';
import { toast } from 'sonner';

type PartyStatus = 'scheduled' | 'completed' | 'cancelled';
type ActionResult = { ok: true } | { error: string };

export function PartyLifecycleButtons({
  partyId,
  unitId,
  budgetStatus,
  status,
  canApprove = true,
  canFinalize = true,
}: {
  partyId: string;
  unitId: string;
  budgetStatus: PartyBudgetStatus;
  status: PartyStatus;
  canApprove?: boolean;
  canFinalize?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const payload = { party_id: partyId, unit_id: unitId };
  const showSubmit = status === 'scheduled' && (budgetStatus === 'draft' || budgetStatus === 'rejected');
  const showApprove = status === 'scheduled' && canApprove && budgetStatus === 'submitted';
  const showFinalize = status === 'scheduled' && canFinalize && budgetStatus === 'approved';

  const run = (fn: () => Promise<ActionResult>, success: string) => {
    start(async () => {
      const res = await fn();
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  };

  if (status === 'completed') {
    return <p className="text-xs text-muted-foreground">Party finalized.</p>;
  }

  if (status === 'cancelled') {
    return <p className="text-xs text-muted-foreground">Party cancelled.</p>;
  }

  if (!showSubmit && !showApprove && !showFinalize) {
    return (
      <p className="text-xs text-muted-foreground">
        Budget {budgetStatus}. Waiting on the next approval step.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSubmit ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(() => submitPartyBudgetAction(payload), 'Budget submitted')}
        >
          {pending ? 'Working…' : 'Submit budget'}
        </Button>
      ) : null}
      {showApprove ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(() => approvePartyBudgetAction(payload), 'Budget approved')}
        >
          {pending ? 'Working…' : 'Approve budget'}
        </Button>
      ) : null}
      {showFinalize ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => finalizePartyAction(payload), 'Party finalized')}
        >
          {pending ? 'Working…' : 'Finalize party'}
        </Button>
      ) : null}
    </div>
  );
}
