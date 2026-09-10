'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getMessBillDetailsAction } from '@/lib/billing/actions';
import type { MessBillWithDetails } from '@/lib/billing/types';
import { FileText, Printer, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface BillDetailDialogProps {
  billId: string;
  billNumber: string;
}

function inr(value: number) {
  return `₹${value.toFixed(2)}`;
}

export function BillDetailDialog({ billId, billNumber }: BillDetailDialogProps) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<MessBillWithDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !details) {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await getMessBillDetailsAction(billId);
        if (res && typeof res === 'object' && 'id' in res) {
          setDetails(res);
        } else if (res && typeof res === 'object' && 'error' in res) {
          setLoadError(res.error);
        } else {
          setLoadError('Statement not found.');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const outstanding = details
    ? Number(details.total_amount) - Number(details.paid_amount ?? 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FileText className="size-3.5" />
          View Statement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="font-mono text-lg">{billNumber}</DialogTitle>
              <DialogDescription>
                {details?.period?.name ?? 'Monthly Mess Bill Statement'}
              </DialogDescription>
            </div>
            <Button size="xs" variant="outline" className="gap-1 text-xs" asChild>
              <Link href={`/billing/${billId}/print`}>
                <Printer className="size-3.5" />
                Print statement
              </Link>
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{loadError}</p>
        ) : details ? (
          <div className="space-y-6 py-2 text-sm">
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 text-xs">
              <div>
                <span className="mb-0.5 block text-muted-foreground">Officer / Member:</span>
                <span className="text-sm font-semibold text-foreground">
                  {details.profile?.rank ? `${details.profile.rank} ` : ''}
                  {details.profile?.full_name ?? 'Officer'}
                </span>
                {details.profile?.service_no && (
                  <span className="block font-mono text-muted-foreground">
                    IC No: {details.profile.service_no}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="mb-0.5 block text-muted-foreground">Billing Cycle:</span>
                <span className="font-mono text-foreground">
                  {details.period?.start_date} to {details.period?.end_date}
                </span>
                <span className="mt-1 block text-muted-foreground">
                  Due on: <strong>{details.due_date}</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <AmountTile label="Messing" amount={Number(details.messing_amount)} />
              <AmountTile label="Bar" amount={Number(details.bar_amount)} />
              <AmountTile label="Rooms" amount={Number(details.room_amount)} />
              <AmountTile label="Guests" amount={Number(details.guest_meal_amount)} />
              <AmountTile label="Funds" amount={Number(details.subscriptions_amount)} />
              <AmountTile label="Misc" amount={Number(details.misc_amount)} />
              <AmountTile label="Party" amount={Number(details.party_amount ?? 0)} />
              <AmountTile label="Arrears" amount={Number(details.arrears_amount ?? 0)} />
            </div>

            <div className="space-y-2">
              <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Itemized Ledger Entries
              </h4>
              <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border text-xs">
                {details.line_items?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="px-1 py-0 text-[9px] uppercase">
                          {item.category}
                        </Badge>
                        <span className="font-medium text-foreground">{item.description}</span>
                      </div>
                      {item.item_date && (
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(item.item_date), 'dd MMM yyyy')}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-semibold text-foreground">
                      {inr(Number(item.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase text-muted-foreground">
                  Bill total {inr(Number(details.total_amount))}
                  {Number(details.paid_amount ?? 0) > 0
                    ? ` · Paid ${inr(Number(details.paid_amount ?? 0))}`
                    : ''}
                </p>
                <p className="font-mono text-xs uppercase text-muted-foreground">Outstanding</p>
                <p className="font-mono text-2xl font-bold text-foreground">{inr(outstanding)}</p>
              </div>
              <Badge
                variant={details.status === 'paid' ? 'success' : 'destructive'}
                className="font-mono text-xs capitalize"
              >
                {details.status}
              </Badge>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AmountTile({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded border border-border p-2">
      <span className="block text-[10px] uppercase text-muted-foreground">{label}</span>
      <span className="font-mono font-bold text-foreground">{inr(amount)}</span>
    </div>
  );
}
