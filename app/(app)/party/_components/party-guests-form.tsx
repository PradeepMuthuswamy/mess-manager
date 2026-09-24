'use client';

import { savingLabel } from '@/components/shared/save-submit';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { addPartyGuestAction } from '@/lib/parties/actions';
import type { MessPartyGuest } from '@/lib/parties/types';
import { toast } from 'sonner';

export function PartyGuestsForm({
  partyId,
  guests = [],
}: {
  partyId: string;
  guests?: MessPartyGuest[];
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {guests.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {guests.map((guest) => (
            <li key={guest.id} className="px-3 py-2 text-sm">
              <p className="text-foreground">{guest.guest_name}</p>
              {guest.notes ? <p className="text-xs text-muted-foreground">{guest.notes}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No guests listed yet.</p>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await addPartyGuestAction({
              party_id: partyId,
              guest_name: guestName,
              notes: notes || undefined,
            });
            if ('error' in res) {
              toast.error(res.error);
              return;
            }
            toast.success('Guest added');
            setGuestName('');
            setNotes('');
            router.refresh();
          });
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`party-guest-name-${partyId}`}>Guest name</Label>
          <Input
            id={`party-guest-name-${partyId}`}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`party-guest-notes-${partyId}`}>Notes</Label>
          <Textarea
            id={`party-guest-notes-${partyId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={pending}>
            {savingLabel(pending, 'Add guest')}
          </Button>
        </div>
      </form>
    </div>
  );
}
