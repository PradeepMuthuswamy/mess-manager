'use client';

import { useState, useTransition } from 'react';
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

export function BillDetailDialog({ billId, billNumber }: BillDetailDialogProps) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<MessBillWithDetails | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !details) {
      setLoading(true);
      try {
        const res = await getMessBillDetailsAction(billId);
        setDetails(res);
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FileText className="size-3.5" />
          View Statement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="font-mono text-lg">{billNumber}</DialogTitle>
              <DialogDescription>
                {details?.period?.name ?? 'Monthly Mess Bill Statement'}
              </DialogDescription>
            </div>
            <Button size="xs" variant="outline" onClick={handlePrint} className="gap-1 text-xs">
              <Printer className="size-3.5" />
              Print
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : details ? (
          <div className="space-y-6 text-sm py-2">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 text-xs">
              <div>
                <span className="text-muted-foreground block mb-0.5">Officer / Member:</span>
                <span className="font-semibold text-foreground text-sm">
                  {details.profile?.rank ? `${details.profile.rank} ` : ''}
                  {details.profile?.full_name ?? 'Officer'}
                </span>
                {details.profile?.service_no && (
                  <span className="text-muted-foreground block font-mono">
                    IC No: {details.profile.service_no}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-muted-foreground block mb-0.5">Billing Cycle:</span>
                <span className="font-mono text-foreground">
                  {details.period?.start_date} to {details.period?.end_date}
                </span>
                <span className="text-muted-foreground block mt-1">
                  Due on: <strong>{details.due_date}</strong>
                </span>
              </div>
            </div>

            {/* Component Summary Breakdown */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
              <div className="rounded border border-border p-2">
                <span className="text-muted-foreground block text-[10px] uppercase">Messing</span>
                <span className="font-mono font-bold text-foreground">
                  ₹{Number(details.messing_amount).toFixed(0)}
                </span>
              </div>
              <div className="rounded border border-border p-2">
                <span className="text-muted-foreground block text-[10px] uppercase">Bar</span>
                <span className="font-mono font-bold text-foreground">
                  ₹{Number(details.bar_amount).toFixed(0)}
                </span>
              </div>
              <div className="rounded border border-border p-2">
                <span className="text-muted-foreground block text-[10px] uppercase">Rooms</span>
                <span className="font-mono font-bold text-foreground">
                  ₹{Number(details.room_amount).toFixed(0)}
                </span>
              </div>
              <div className="rounded border border-border p-2">
                <span className="text-muted-foreground block text-[10px] uppercase">Guests</span>
                <span className="font-mono font-bold text-foreground">
                  ₹{Number(details.guest_meal_amount).toFixed(0)}
                </span>
              </div>
              <div className="rounded border border-border p-2">
                <span className="text-muted-foreground block text-[10px] uppercase">Funds</span>
                <span className="font-mono font-bold text-foreground">
                  ₹{Number(details.subscriptions_amount).toFixed(0)}
                </span>
              </div>
              <div className="rounded border border-border p-2">
                <span className="text-muted-foreground block text-[10px] uppercase">Misc</span>
                <span className="font-mono font-bold text-foreground">
                  ₹{Number(details.misc_amount).toFixed(0)}
                </span>
              </div>
            </div>

            {/* Detailed Line Items */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Itemized Ledger Entries
              </h4>
              <div className="divide-y divide-border border border-border rounded-md max-h-60 overflow-y-auto text-xs">
                {details.line_items?.map((item) => (
                  <div key={item.id} className="p-2.5 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="uppercase text-[9px] px-1 py-0">
                          {item.category}
                        </Badge>
                        <span className="font-medium text-foreground">{item.description}</span>
                      </div>
                      {item.item_date && (
                        <span className="text-muted-foreground text-[10px]">
                          {format(new Date(item.item_date), 'dd MMM yyyy')}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-semibold text-foreground">
                      ₹{Number(item.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Footer */}
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex justify-between items-center">
              <div>
                <span className="text-xs text-muted-foreground uppercase font-mono">
                  Net Amount Payable
                </span>
                <p className="text-2xl font-bold font-mono text-foreground">
                  ₹{Number(details.total_amount).toFixed(2)}
                </p>
              </div>
              <Badge
                variant={details.status === 'paid' ? 'success' : 'destructive'}
                className="capitalize text-xs font-mono"
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
