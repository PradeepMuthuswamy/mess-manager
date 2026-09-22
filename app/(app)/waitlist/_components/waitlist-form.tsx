'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createWaitlistRequestAction } from '@/lib/waitlist/actions';
import { toast } from 'sonner';

export function WaitlistForm({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [guestName, setGuestName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createWaitlistRequestAction({
            unit_id: unitId,
            guest_name: guestName,
            requested_from: from,
            requested_to: to,
            notes: notes || null,
          });
          if ('error' in res) {
            toast.error(res.error);
            return;
          }
          toast.success('Room request saved');
          setGuestName('');
          setFrom('');
          setTo('');
          setNotes('');
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="wl-guest">Guest name</Label>
        <Input id="wl-guest" value={guestName} onChange={(e) => setGuestName(e.target.value)} required minLength={2} maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wl-from">Check-in</Label>
        <Input id="wl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wl-to">Check-out</Label>
        <Input id="wl-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} required />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="wl-notes">Notes</Label>
        <Textarea id="wl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Request a room'}
        </Button>
      </div>
    </form>
  );
}
