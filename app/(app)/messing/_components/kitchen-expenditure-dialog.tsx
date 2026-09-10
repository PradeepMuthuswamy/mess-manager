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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { recordDailyKitchenExpenditureAction } from '@/lib/messing/actions';
import { UtensilsCrossed, Calculator, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type SourcingCategory = 'LOCAL_PURCHASE' | 'CANTEEN' | 'OTHER';

interface KitchenExpenditureDialogProps {
  unitId: string;
  date: string;
  presentCount: number;
  initialMorning?: number;
  initialAfternoon?: number;
  initialDinner?: number;
  initialNotes?: string | null;
  initialVendor?: string | null;
  initialReceipt?: string | null;
  initialSourcing?: string | null;
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
  initialReceipt = '',
  initialSourcing = 'LOCAL_PURCHASE',
}: KitchenExpenditureDialogProps) {
  const [open, setOpen] = useState(false);
  const [morning, setMorning] = useState(initialMorning);
  const [afternoon, setAfternoon] = useState(initialAfternoon);
  const [dinner, setDinner] = useState(initialDinner);
  const [vendor, setVendor] = useState(initialVendor ?? '');
  const [receipt, setReceipt] = useState(initialReceipt ?? '');
  const [sourcing, setSourcing] = useState<SourcingCategory>(
    (initialSourcing as SourcingCategory) || 'LOCAL_PURCHASE',
  );
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [isPending, startTransition] = useTransition();

  const total = (morning || 0) + (afternoon || 0) + (dinner || 0);
  const previewPRate = presentCount > 0 ? total / presentCount : 0;

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
        receipt_ref: receipt || undefined,
        notes: notes || undefined,
        sourcing_category: sourcing,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        const data = res.data as { presentCount?: number; ratePerDiner?: number } | undefined;
        const rate = data?.ratePerDiner ?? 0;
        const diners = data?.presentCount ?? 0;
        toast.success(
          diners > 0
            ? `Kitchen log saved. P-rate ₹${rate.toFixed(2)}/diner (${diners} finalized).`
            : 'Kitchen log saved as draft. P-rate updates after attendance is finalized.',
        );
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
              Log actual market purchases for {date}. Saving reopens the register as draft.
              Preview uses {presentCount} diners on roll; billed P-rate waits for finalized attendance.
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

            <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Total Day Kitchen Expense:</span>
                <span className="font-mono font-bold text-foreground">₹{total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Diners on roll (preview):</span>
                <span className="font-mono text-foreground">{presentCount}</span>
              </div>
              <div className="my-1 h-px bg-primary/10" />
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-primary">Preview P-Rate:</span>
                <span className="font-mono text-primary">₹{previewPRate.toFixed(2)} / diner</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="receipt">Receipt / voucher ref</Label>
                <Input
                  id="receipt"
                  value={receipt}
                  onChange={(e) => setReceipt(e.target.value)}
                  placeholder="e.g. CM-1042"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sourcing</Label>
                <Select value={sourcing} onValueChange={(v) => setSourcing(v as SourcingCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOCAL_PURCHASE">Local purchase</SelectItem>
                    <SelectItem value="CANTEEN">Canteen</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
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
              <Label htmlFor="notes">Remarks</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special menu details, extra dairy..."
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
              Save kitchen log
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
