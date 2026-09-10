'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { offerWaitlistAction, markWaitlistBookedAction } from '@/lib/waitlist/actions';
import type { RoomWaitlistRequest } from '@/lib/waitlist/types';
import { toast } from 'sonner';

export function WaitlistQueue({ unitId, rows }: { unitId: string; rows: RoomWaitlistRequest[] }) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = rows.filter((row) => row.unit_id === unitId);

  function run(id: string, key: string, action: (id: string) => Promise<{ ok: true } | { error: string }>, ok: string) {
    setPendingKey(key);
    start(async () => {
      const res = await action(id);
      setPendingKey(null);
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">No open waitlist requests.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Guest</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => {
            const offering = pending && pendingKey === `${row.id}:offer`;
            const booking = pending && pendingKey === `${row.id}:book`;
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium text-foreground">{row.guest_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(row.requested_from), 'dd MMM')} –{' '}
                  {format(new Date(row.requested_to), 'dd MMM yyyy')}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {row.notes ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {row.status === 'requested' && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(row.id, `${row.id}:offer`, offerWaitlistAction, 'Room offered')}
                      >
                        {offering ? 'Offering…' : 'Offer'}
                      </Button>
                    )}
                    {row.status === 'offered' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(row.id, `${row.id}:book`, markWaitlistBookedAction, 'Marked booked')
                        }
                      >
                        {booking ? 'Saving…' : 'Mark booked'}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
