'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createPartyAction } from '@/lib/parties/actions';
import { toast } from 'sonner';

export function CreatePartyForm({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [partyDate, setPartyDate] = useState('');
  const [venue, setVenue] = useState('');
  const [partyType, setPartyType] = useState<'mess' | 'individual'>('mess');
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createPartyAction({
            unit_id: unitId,
            title,
            party_date: partyDate,
            venue: venue || null,
            party_type: partyType,
            notes: notes || null,
          });
          if ('error' in res) {
            toast.error(res.error);
            return;
          }
          toast.success('Party scheduled');
          setTitle('');
          setPartyDate('');
          setVenue('');
          setNotes('');
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="party-title">Title</Label>
        <Input id="party-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="party-date">Date</Label>
        <Input
          id="party-date"
          type="date"
          value={partyDate}
          onChange={(e) => setPartyDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select value={partyType} onValueChange={(v) => setPartyType(v as 'mess' | 'individual')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mess">Mess party</SelectItem>
            <SelectItem value="individual">Individual (host charged)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="party-venue">Venue</Label>
        <Input id="party-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="party-notes">Notes</Label>
        <Textarea id="party-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Schedule party'}
        </Button>
      </div>
    </form>
  );
}
