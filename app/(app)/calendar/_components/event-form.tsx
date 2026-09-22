'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createCalendarEventAction } from '@/lib/calendar/actions';
import { eventTypeEnum, type EventType } from '@/lib/schemas/calendar';
import { toast } from 'sonner';
import { EVENT_TYPE_LABELS } from './calendar-list';

export type CalendarMemberOption = {
  id: string;
  name: string;
  email?: string | null;
  service_no?: string | null;
};

export function EventForm({
  unitId,
  members = [],
  defaultDate,
}: {
  unitId: string;
  members?: CalendarMemberOption[];
  defaultDate?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(defaultDate ?? '');
  const [endDate, setEndDate] = useState('');
  const [eventType, setEventType] = useState<EventType>('other');
  const [profileId, setProfileId] = useState('none');
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (defaultDate) setEventDate(defaultDate);
  }, [defaultDate]);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createCalendarEventAction({
            unit_id: unitId,
            event_date: eventDate,
            end_date: endDate || null,
            event_type: eventType,
            title,
            description: description || null,
            profile_id: profileId === 'none' ? null : profileId,
            is_recurring: isRecurring,
          });
          if ('error' in res) {
            toast.error(res.error);
            return;
          }
          toast.success('Event added');
          setTitle('');
          setEndDate('');
          setDescription('');
          setProfileId('none');
          setIsRecurring(false);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="cal-title">Title</Label>
        <Input
          id="cal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={160}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cal-date">Date</Label>
        <Input
          id="cal-date"
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cal-end">End date (optional)</Label>
        <Input
          id="cal-end"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={eventDate || undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {eventTypeEnum.options.map((type) => (
              <SelectItem key={type} value={type}>
                {EVENT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Member (optional)</Label>
        <Select value={profileId} onValueChange={setProfileId}>
          <SelectTrigger>
            <SelectValue placeholder="No member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No member</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
                {member.service_no ? ` · ${member.service_no}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="cal-notes">Notes</Label>
        <Textarea
          id="cal-notes"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={1000}
        />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          id="cal-recurring"
          checked={isRecurring}
          onCheckedChange={(value) => setIsRecurring(value === true)}
        />
        <Label htmlFor="cal-recurring" className="font-normal">
          Recurring annually
        </Label>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Add event'}
        </Button>
      </div>
    </form>
  );
}
