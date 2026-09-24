'use client';

import { savingLabel } from '@/components/shared/save-submit';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cancelWaitlistRequestAction } from '@/lib/waitlist/actions';
import { toast } from 'sonner';

export function CancelWaitlistButton({ id, unitId }: { id: string; unitId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const res = await cancelWaitlistRequestAction(id, unitId);
          if ('error' in res) {
            toast.error(res.error);
            return;
          }
          toast.success('Request cancelled');
          router.refresh();
        });
      }}
    >
      {savingLabel(pending, 'Cancel')}
    </Button>
  );
}
