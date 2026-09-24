'use client';

import { savingLabel } from '@/components/shared/save-submit';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { publishCalendarMonthAction } from '@/lib/calendar/actions';
import type { CalendarPublish } from '@/lib/calendar/types';
import { toast } from 'sonner';

export function PublishButton({
  unitId,
  year,
  month,
  published,
}: {
  unitId: string;
  year: number;
  month: number;
  published?: CalendarPublish | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const label = format(new Date(year, month - 1, 1), 'MMMM yyyy');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {published ? (
        <Badge variant="success">
          Published {format(new Date(published.published_at), 'd MMM yyyy')}
        </Badge>
      ) : (
        <Badge variant="outline">Draft</Badge>
      )}
      <Button
        type="button"
        size="sm"
        onClick={() => {
          start(async () => {
            const res = await publishCalendarMonthAction(unitId, year, month);
            if ('error' in res) {
              toast.error(res.error);
              return;
            }
            toast.success(`${label} calendar published`);
            router.refresh();
          });
        }}
        disabled={pending}
      >
        {savingLabel(
          pending,
          <>
            <Send className="size-4" />
            {published ? 'Publish again' : `Publish ${label}`}
          </>,
        )}
      </Button>
    </div>
  );
}
