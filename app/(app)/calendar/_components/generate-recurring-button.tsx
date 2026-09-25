'use client';

import { savingLabel } from '@/components/shared/save-submit';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateRecurringEventsAction } from '@/lib/calendar/actions';
import { toast } from 'sonner';

export function GenerateRecurringButton({
  unitId,
  year,
}: {
  unitId: string;
  year: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        start(async () => {
          const res = await generateRecurringEventsAction(unitId, year);
          if ('error' in res) {
            toast.error(res.error);
            return;
          }
          toast.success(
            `Generated ${res.inserted} birthday/anniversary event${res.inserted === 1 ? '' : 's'}${
              res.skipped ? `, skipped ${res.skipped} already on the calendar` : ''
            }`,
          );
          router.refresh();
        });
      }}
      disabled={pending}
    >
      {savingLabel(
        pending,
        <>
          <Repeat className="size-4" />
          {`Generate ${year} birthdays`}
        </>,
      )}
    </Button>
  );
}
