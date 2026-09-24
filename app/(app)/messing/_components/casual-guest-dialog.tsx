'use client';

import { savingLabel } from '@/components/shared/save-submit';

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { recordGuestMealAction } from '@/lib/messing/actions';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { MessingMealType } from '@/lib/schemas/messing';

interface CasualGuestDialogProps {
  unitId: string;
  hostProfileId: string;
  date: string;
  defaultGuestRate?: number;
}

export function CasualGuestDialog({
  unitId,
  hostProfileId,
  date,
  defaultGuestRate = 250,
}: CasualGuestDialogProps) {
  const [open, setOpen] = useState(false);
  const [mealType, setMealType] = useState<MessingMealType>('lunch');
  const [guestCount, setGuestCount] = useState(1);
  const [rate, setRate] = useState(defaultGuestRate);
  const [guestNames, setGuestNames] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const total = guestCount * rate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await recordGuestMealAction({
        unit_id: unitId,
        host_profile_id: hostProfileId,
        meal_date: date,
        meal_type: mealType,
        guest_count: guestCount,
        rate_charged: rate,
        guest_names: guestNames || undefined,
        notes: notes || undefined,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Guest meal recorded: ₹${total.toFixed(2)} added to monthly bill.`);
        setOpen(false);
        setGuestNames('');
        setNotes('');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <UserPlus className="size-4" />
          Host Casual Guest
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Host Dining Guest</DialogTitle>
            <DialogDescription>
              Record casual dining guest charges (family, parents, or visiting friends). Billed to your monthly mess bill.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meal Session</Label>
                <Select value={mealType} onValueChange={(v) => setMealType(v as MessingMealType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">Breakfast</SelectItem>
                    <SelectItem value="lunch">Lunch</SelectItem>
                    <SelectItem value="dinner">Dinner</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="guestCount">Number of Guests</Label>
                <Input
                  id="guestCount"
                  type="number"
                  min="1"
                  max="50"
                  value={guestCount}
                  onChange={(e) => setGuestCount(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guestNames">Guest Name(s) / Relation</Label>
              <Input
                id="guestNames"
                placeholder="e.g. Mrs. Sharma (Spouse), 2 College Friends"
                value={guestNames}
                onChange={(e) => setGuestNames(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guestNotes">Notes</Label>
              <Textarea
                id="guestNotes"
                placeholder="Occasion, dietary notes, or host remarks"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rate">Tariff per Guest (₹)</Label>
              <Input
                id="rate"
                type="number"
                step="1"
                min="0"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="rounded-md bg-muted p-3 flex justify-between items-center text-sm font-medium">
              <span className="text-muted-foreground">Total Billable:</span>
              <span className="text-lg font-mono font-bold text-foreground">₹{total.toFixed(2)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              {savingLabel(isPending, 'Charge to My Mess Bill')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
