'use client';

import { savingLabel } from '@/components/shared/save-submit';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import { addPartyCostLineAction } from '@/lib/parties/actions';
import type { MessPartyCostLine, PartyCostCategory, PartyCostFunding } from '@/lib/parties/types';
import { toast } from 'sonner';

const CATEGORY_LABELS: Record<PartyCostCategory, string> = {
  ration: 'Ration',
  bar: 'Bar',
  catering: 'Catering',
  other: 'Other',
};

const FUNDING_LABELS: Record<PartyCostFunding, string> = {
  mess: 'Mess fund',
  host: 'Host',
  guest: 'Guest',
};

function inr(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PartyCostsForm({
  partyId,
  unitId,
  costLines = [],
}: {
  partyId: string;
  unitId: string;
  costLines?: MessPartyCostLine[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState<PartyCostCategory>('ration');
  const [funding, setFunding] = useState<PartyCostFunding>('mess');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [pending, start] = useTransition();

  const total = costLines.reduce((sum, line) => sum + Number(line.amount), 0);

  return (
    <div className="space-y-3">
      {costLines.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {costLines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <p className="text-foreground">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[line.category]} · {FUNDING_LABELS[line.funding]}
                </p>
              </div>
              <span className="font-mono text-foreground">{inr(Number(line.amount))}</span>
            </li>
          ))}
          <li className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono font-medium text-foreground">{inr(total)}</span>
          </li>
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No cost lines yet.</p>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsedAmount = Number(amount);
          if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
            toast.error('Enter a valid amount.');
            return;
          }
          start(async () => {
            const res = await addPartyCostLineAction({
              party_id: partyId,
              unit_id: unitId,
              category,
              funding,
              description,
              amount: parsedAmount,
            });
            if ('error' in res) {
              toast.error(res.error);
              return;
            }
            toast.success('Cost line added');
            setDescription('');
            setAmount('');
            router.refresh();
          });
        }}
      >
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as PartyCostCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CATEGORY_LABELS) as PartyCostCategory[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Funding</Label>
          <Select value={funding} onValueChange={(v) => setFunding(v as PartyCostFunding)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FUNDING_LABELS) as PartyCostFunding[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {FUNDING_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`party-cost-desc-${partyId}`}>Description</Label>
          <Input
            id={`party-cost-desc-${partyId}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`party-cost-amount-${partyId}`}>Amount (₹)</Label>
          <Input
            id={`party-cost-amount-${partyId}`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={pending}>
            {savingLabel(pending, 'Add cost')}
          </Button>
        </div>
      </form>
    </div>
  );
}
