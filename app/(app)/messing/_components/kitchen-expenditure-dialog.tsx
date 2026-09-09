'use client';

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
import { recordDailyKitchenExpenditureAction } from '@/lib/messing/actions';
import { UtensilsCrossed, Calculator, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface KitchenExpenditureDialogProps {
  unitId: string;
  date: string;
  presentCount: number;
  initialMorning?: number;
  initialAfternoon?: number;
  initialDinner?: number;
  initialNotes?: string | null;
  initialVendor?: string | null;
}

export function KitchenExpenditureDialog({
  unitId,
  date,
  presentCount,
  initialMorning = 0,
  initialAfternoon = 0,
  initialDinner = 0,
  initialNotes = '',
  initialVendor = '',
}: KitchenExpenditureDialogProps) {
  const [open, setOpen] = useState(false);
  const [morning, setMorning] = useState(initialMorning);
  const [afternoon, setAfternoon] = useState(initialAfternoon);
  const [dinner, setDinner] = useState(initialDinner);
  const [vendor, setVendor] = useState(initialVendor ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [isPending, startTransition] = useTransition();

  const total = (morning || 0) + (afternoon || 0) + (dinner || 0);
  const calculatedPRate = presentCount > 0 ? total / presentCount : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await recordDailyKitchenExpenditureAction({
        unit_id: unitId,
        expenditure_date: date,
        morning_amount: morning,
        afternoon_amount: afternoon,
        dinner_amount: dinner,
        vendor_name: vendor || undefined,
        notes: notes || undefined,
        sourcing_category: 'LOCAL_PURCHASE',
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Kitchen log saved! P-rate arrived at ₹${calculatedPRate.toFixed(2)}/diner.`);
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="gap-2">
          <UtensilsCrossed className="size-4" />
          Mess Havildar Log
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="size-5 text-primary" />
              Daily Kitchen Expenditure (P-Register)
            </DialogTitle>
            <DialogDescription>
              Log actual market purchases for {date}. Total costs will be split across {presentCount} diners present.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="morning">Breakfast (₹)</Label>
                <Input
                  id="morning"
                  type="number"
                  step="0.01"
                  min="0"
                  value={morning || ''}
                  onChange={(e) => setMorning(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="afternoon">Lunch (₹)</Label>
                <Input
                  id="afternoon"
                  type="number"
                  step="0.01"
                  min="0"
                  value={afternoon || ''}
                  onChange={(e) => setAfternoon(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dinner">Dinner (₹)</Label>
                <Input
                  id="dinner"
                  type="number"
                  step="0.01"
                  min="0"
                  value={dinner || ''}
                  onChange={(e) => setDinner(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Real-time Calculation Summary Card */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1 text-xs">
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Total Day Kitchen Expense:</span>
                <span className="font-mono font-bold text-foreground">₹{total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Total Diners Present (P):</span>
                <span className="font-mono text-foreground">{presentCount}</span>
              </div>
              <div className="h-px bg-primary/10 my-1" />
              <div className="flex justify-between font-semibold text-sm">
                <span className="text-primary">Computed P-Rate (P_d):</span>
                <span className="font-mono text-primary">₹{calculatedPRate.toFixed(2)} / diner</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vendor">Vendor / Market Shop Name</Label>
              <Input
                id="vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. Cantt Fresh Market, Local Dairy"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Remarks / Voucher No.</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cash memo numbers, extra dairy, special menu details..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Save & Snapshot P-Rate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
