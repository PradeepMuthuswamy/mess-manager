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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { markBillPaidAction } from '@/lib/billing/actions';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';

interface BillPaymentDialogProps {
  billId: string;
  totalAmount: number;
  billNumber: string;
}

export function BillPaymentDialog({ billId, totalAmount, billNumber }: BillPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState(totalAmount);
  const [method, setMethod] = useState('UPI');
  const [ref, setRef] = useState('');
  const [isPending, startTransition] = useTransition();

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await markBillPaidAction({
        bill_id: billId,
        paid_amount: paidAmount,
        payment_method: method,
        payment_reference: ref || undefined,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Payment of ₹${paidAmount.toFixed(2)} recorded for ${billNumber}.`);
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <CreditCard className="size-4" />
          Settle Dues
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handlePay}>
          <DialogHeader>
            <DialogTitle>Settle Mess Bill ({billNumber})</DialogTitle>
            <DialogDescription>
              Record bank transfer, UPI settlement, or cheque clearance against outstanding mess dues.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="amt">Settlement Amount (₹)</Label>
              <Input
                id="amt"
                type="number"
                step="0.01"
                min="1"
                value={paidAmount}
                onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI / QR Code</SelectItem>
                  <SelectItem value="NEFT">NEFT / RTGS (Bank Transfer)</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="SalaryDeduction">Salary Account Remittance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ref">UTR / Transaction Ref No.</Label>
              <Input
                id="ref"
                placeholder="e.g. UTR-20260601-9823412"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              {savingLabel(isPending, 'Confirm Payment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
