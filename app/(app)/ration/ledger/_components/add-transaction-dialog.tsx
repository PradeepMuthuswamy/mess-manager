'use client';

import { savingLabel } from '@/components/shared/save-submit';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createRationStockTransactionAction } from '@/lib/ration/actions';
import type { EligibleItem } from '@/lib/ration/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';

const TX_TYPES = ['receipt', 'adjustment', 'return_to_source'] as const;
type TxType = (typeof TX_TYPES)[number];

const SOURCE_OPTIONS = [
  { value: 'canteen', label: 'Canteen' },
  { value: 'local', label: 'Local' },
  { value: 'govt issue', label: 'Govt issue' },
  { value: 'other', label: 'Other' },
] as const;

type SourceValue = (typeof SOURCE_OPTIONS)[number]['value'];

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

  const [itemId, setItemId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<TxType>('receipt');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<SourceValue | ''>('');
  const [otherSource, setOtherSource] = useState('');
  const [notes, setNotes] = useState('');

  const isAdjustment = type === 'adjustment';

  const syncAmount = (nextQty: string, nextRate: string) => {
    const q = parseFloat(nextQty);
    const r = parseFloat(nextRate);
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
      setAmount('');
      return;
    }
    setAmount((Math.abs(q) * r).toFixed(2));
  };

  const handleQtyChange = (val: string) => {
    setQty(val);
    syncAmount(val, rate);
  };

  const handleRateChange = (val: string) => {
    setRate(val);
    syncAmount(qty, val);
  };

  const handleTypeChange = (next: TxType) => {
    setType(next);
    if (next !== 'adjustment') {
      const q = parseFloat(qty);
      if (Number.isFinite(q) && q < 0) {
        const abs = Math.abs(q).toString();
        setQty(abs);
        syncAmount(abs, rate);
      }
    }
  };

  const resetForm = () => {
    setItemId('');
    setQty('');
    setRate('');
    setAmount('');
    setSource('');
    setOtherSource('');
    setNotes('');
    setType('receipt');
  };

  const resolvedSource = () => {
    if (!source) return undefined;
    if (source === 'other') {
      const custom = otherSource.trim();
      return custom || 'other';
    }
    return source;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemId) {
      toast.error('Please select an item');
      return;
    }
    if (!source) {
      toast.error('Please select a source');
      return;
    }
    const q = parseFloat(qty);
    if (!Number.isFinite(q) || q === 0) {
      toast.error(
        isAdjustment
          ? 'Enter a non-zero quantity. Use a negative value to reduce stock.'
          : 'Quantity must be greater than 0',
      );
      return;
    }
    if (!isAdjustment && q < 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }
    const r = parseFloat(rate);
    if (!Number.isFinite(r) || r < 0) {
      toast.error('Rate cannot be negative');
      return;
    }
    const a = parseFloat(amount);
    if (!Number.isFinite(a) || a < 0) {
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
        source: resolvedSource(),
        notes: notes || undefined,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Transaction logged successfully.');
        setOpen(false);
        resetForm();
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
          <div className="space-y-1.5">
            <Label htmlFor="item">Ration Item</Label>
            <Select
              value={itemId}
              onValueChange={setItemId}
              disabled={isPending}
            >
              <SelectTrigger id="item" className="w-full">
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {eligibleItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.uom})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => handleTypeChange(v as TxType)}
                disabled={isPending}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">Receipt (Supply)</SelectItem>
                  <SelectItem value="adjustment">Adjustment (+/−)</SelectItem>
                  <SelectItem value="return_to_source">Return to source</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                step="any"
                min={isAdjustment ? undefined : '0.0001'}
                placeholder={isAdjustment ? '±0.0' : '0.0'}
                value={qty}
                disabled={isPending}
                required
                onChange={(e) => handleQtyChange(e.target.value)}
              />
              {isAdjustment && (
                <p className="text-xs text-muted-foreground">
                  Negative quantity reduces stock.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={amount}
                disabled={isPending}
                required
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source">Source</Label>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as SourceValue)}
              disabled={isPending}
            >
              <SelectTrigger id="source" className="w-full">
                <SelectValue placeholder="Canteen, local, govt issue, or other" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {source === 'other' && (
            <div className="space-y-1.5">
              <Label htmlFor="other-source">Specify source</Label>
              <Input
                id="other-source"
                type="text"
                maxLength={100}
                placeholder="Supplier or voucher reference"
                value={otherSource}
                disabled={isPending}
                onChange={(e) => setOtherSource(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              type="text"
              maxLength={300}
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
              {savingLabel(isPending, 'Save Transaction')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
