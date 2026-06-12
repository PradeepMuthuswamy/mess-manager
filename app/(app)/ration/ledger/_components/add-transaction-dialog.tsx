'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createRationStockTransactionAction } from '@/lib/ration/actions';
import type { EligibleItem } from '@/lib/ration/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

type AddTransactionDialogProps = {
  unitId: string;
  eligibleItems: EligibleItem[];
};

export function AddTransactionDialog({
  unitId,
  eligibleItems,
}: AddTransactionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [itemId, setItemId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<'receipt' | 'adjustment' | 'return_to_source'>('receipt');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');

  // Handle Qty/Rate change for Auto-amount
  const handleQtyChange = (val: string) => {
    setQty(val);
    const q = parseFloat(val) || 0;
    const r = parseFloat(rate) || 0;
    setAmount((q * r).toFixed(2));
  };

  const handleRateChange = (val: string) => {
    setRate(val);
    const q = parseFloat(qty) || 0;
    const r = parseFloat(val) || 0;
    setAmount((q * r).toFixed(2));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemId) {
      toast.error('Please select an item');
      return;
    }
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }
    const r = parseFloat(rate);
    if (isNaN(r) || r < 0) {
      toast.error('Rate cannot be negative');
      return;
    }
    const a = parseFloat(amount);
    if (isNaN(a) || a < 0) {
      toast.error('Amount cannot be negative');
      return;
    }

    startTransition(async () => {
      const res = await createRationStockTransactionAction({
        unit_id: unitId,
        variant_id: itemId,
        transaction_date: date,
        type,
        quantity: q,
        rate: r,
        amount: a,
        source: source || undefined,
        notes: notes || undefined,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Transaction logged successfully.');
        setOpen(false);
        // Reset form
        setItemId('');
        setQty('');
        setRate('');
        setAmount('');
        setSource('');
        setNotes('');
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" size="sm">
          <Plus className="size-4" />
          Add Transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Stock Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="item">Ration Item</Label>
            <select
              id="item"
              value={itemId}
              disabled={isPending}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">-- Select Item --</option>
              {eligibleItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.uom})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                disabled={isPending}
                required
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                value={type}
                disabled={isPending}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="receipt">Receipt (Supply)</option>
                <option value="adjustment">Adjustment (+/-)</option>
                <option value="return_to_source">Return to Source</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                step="any"
                min="0.0001"
                placeholder="0.0"
                value={qty}
                disabled={isPending}
                required
                onChange={(e) => handleQtyChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rate">Rate</Label>
              <Input
                id="rate"
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={rate}
                disabled={isPending}
                required
                onChange={(e) => handleRateChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="any"
                placeholder="0.00"
                value={amount}
                disabled={isPending}
                required
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="source">Source / Voucher No.</Label>
            <Input
              id="source"
              type="text"
              placeholder="e.g. Supply Depot, Invoice #123"
              value={source}
              disabled={isPending}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              type="text"
              placeholder="Optional notes"
              value={notes}
              disabled={isPending}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Logging...' : 'Save Transaction'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
