'use client';

import { savingLabel } from '@/components/shared/save-submit';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import { formatStayDate, type RoomWaitlistRequest } from '@/lib/waitlist/types';
import { toast } from 'sonner';

type RoomOption = { id: string; name: string };

export function WaitlistQueue({
  unitId,
  rows,
  rooms,
}: {
  unitId: string;
  rows: RoomWaitlistRequest[];
  rooms: RoomOption[];
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [roomChoice, setRoomChoice] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const visible = rows.filter((row) => row.unit_id === unitId);

  function run(
    key: string,
    action: () => Promise<{ ok: true } | { error: string }>,
    ok: string,
  ) {
    setPendingKey(key);
    start(async () => {
      const res = await action();
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
    return <p className="text-sm text-muted-foreground">No open room requests.</p>;
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
                  {formatStayDate(row.requested_from, 'dd MMM')} –{' '}
                  {formatStayDate(row.requested_to, 'dd MMM yyyy')}
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
                        onClick={() =>
                          run(
                            `${row.id}:offer`,
                            () => offerWaitlistAction(row.id),
                            'Room offered',
                          )
                        }
                      >
                        {savingLabel(offering, 'Offer')}
                      </Button>
                    )}
                    {row.status === 'offered' && (
                      <>
                        <select
                          aria-label={`Room for ${row.guest_name}`}
                          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                          value={roomChoice[row.id] ?? ''}
                          disabled={pending || rooms.length === 0}
                          onChange={(event) =>
                            setRoomChoice((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {rooms.length === 0 ? 'No rooms' : 'Choose a room'}
                          </option>
                          {rooms.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending || rooms.length === 0}
                          onClick={() => {
                            const roomId = roomChoice[row.id];
                            if (!roomId) {
                              toast.error('Choose a room.');
                              return;
                            }
                            run(
                              `${row.id}:book`,
                              () => markWaitlistBookedAction(row.id, roomId),
                              'Room booked',
                            );
                          }}
                        >
                          {savingLabel(booking, 'Book room')}
                        </Button>
                      </>
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
