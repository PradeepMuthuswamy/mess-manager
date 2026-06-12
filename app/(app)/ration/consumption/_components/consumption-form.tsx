'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { postDailyRationConsumptionAction, rollbackDailyRationConsumptionAction } from '@/lib/ration/actions';
import type { DailyRationConsumptionItem } from '@/lib/ration/queries';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Trash2, ArrowDownRight, RefreshCw } from 'lucide-react';

type ConsumptionFormProps = {
  unitId: string;
  date: string;
  attendanceStatus: 'draft' | 'finalized' | 'none';
  presentCount: number;
  initialItems: DailyRationConsumptionItem[];
  canWrite: boolean;
};

export function ConsumptionForm({
  unitId,
  date,
  attendanceStatus,
  presentCount,
  initialItems,
  canWrite,
}: ConsumptionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isAlreadyPosted = initialItems.some((item) => item.is_posted);

  const handlePost = () => {
    if (presentCount <= 0) {
      toast.error('Cannot post consumption for a day with 0 dining strength.');
      return;
    }

    startTransition(async () => {
      const res = await postDailyRationConsumptionAction({
        unit_id: unitId,
        consumption_date: date,
        items: initialItems.map((i) => ({
          variant_id: i.variant_id,
          quantity: i.computed_qty,
        })),
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Ration consumption posted and stock decremented successfully.');
        router.refresh();
      }
    });
  };

  const handleRollback = () => {
    if (!confirm('Are you sure you want to rollback this consumption? This will restore the stock levels.')) {
      return;
    }

    startTransition(async () => {
      const res = await rollbackDailyRationConsumptionAction({
        unit_id: unitId,
        consumption_date: date,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Ration consumption rolled back and stock restored successfully.');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Header & Status Alerts */}
      {isAlreadyPosted ? (
        <Alert variant="default" className="border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-400">
          <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
          <div className="ml-3">
            <AlertTitle className="font-semibold text-base">Stock Ledger Posted</AlertTitle>
            <AlertDescription className="text-sm opacity-90 mt-1">
              Consumption for this day has been committed to the stock ledger. Stock quantities have been decremented by the computed quantities below.
            </AlertDescription>
          </div>
        </Alert>
      ) : (
        <>
          {attendanceStatus === 'none' && (
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/5 text-destructive-foreground">
              <AlertCircle className="size-5 shrink-0 text-destructive" />
              <div className="ml-3">
                <AlertTitle className="font-semibold text-base text-destructive">No Attendance Record Found</AlertTitle>
                <AlertDescription className="text-sm opacity-90 mt-1">
                  Dining strength is not recorded for this date. Go to the{' '}
                  <a href={`/attendance?date=${date}`} className="underline font-semibold hover:text-destructive-foreground/80 transition-colors">
                    Attendance Module
                  </a>{' '}
                  to finalize strength before posting consumption.
                </AlertDescription>
              </div>
            </Alert>
          )}

          {attendanceStatus === 'draft' && (
            <Alert variant="default" className="border-amber-500/20 bg-amber-500/5 text-amber-800 dark:text-amber-400">
              <AlertCircle className="size-5 shrink-0 text-amber-500" />
              <div className="ml-3">
                <AlertTitle className="font-semibold text-base">Attendance is Draft</AlertTitle>
                <AlertDescription className="text-sm opacity-90 mt-1">
                  The dining strength is not finalized yet. It is highly recommended to finalize the strength in the{' '}
                  <a href={`/attendance?date=${date}`} className="underline font-semibold hover:opacity-85">
                    Attendance Module
                  </a>{' '}
                  to ensure calculations are accurate.
                </AlertDescription>
              </div>
            </Alert>
          )}

          {attendanceStatus === 'finalized' && (
            <Alert variant="default" className="border-sky-500/20 bg-sky-500/5 text-sky-800 dark:text-sky-400">
              <CheckCircle2 className="size-5 shrink-0 text-sky-500" />
              <div className="ml-3">
                <AlertTitle className="font-semibold text-base">Attendance Finalized</AlertTitle>
                <AlertDescription className="text-sm opacity-90 mt-1">
                  Dining strength is locked at <strong>{presentCount}</strong> members. Ready to post consumption.
                </AlertDescription>
              </div>
            </Alert>
          )}
        </>
      )}

      {/* Main Container */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Detail Panel */}
        <div className="p-5 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground">Consumption Calculation</h3>
            <p className="text-xs text-muted-foreground">
              Formula: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">Scale Authorisation Qty</code> &times;{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">Total Present Count ({presentCount})</code>
            </p>
          </div>
          {canWrite && (
            <div>
              {isAlreadyPosted ? (
                <Button
                  variant="destructive"
                  onClick={handleRollback}
                  disabled={isPending}
                  className="gap-2 shadow-sm font-semibold transition-all hover:bg-destructive/90"
                >
                  {isPending ? <RefreshCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Rollback Post
                </Button>
              ) : (
                <Button
                  onClick={handlePost}
                  disabled={isPending || presentCount <= 0}
                  className="gap-2 shadow-sm font-semibold transition-all bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isPending ? <RefreshCw className="size-4 animate-spin" /> : <ArrowDownRight className="size-4" />}
                  Post Daily Consumption
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Items Table */}
        {initialItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground bg-card">
            <p className="text-sm font-medium">No scale or active items configured for this unit.</p>
            <p className="text-xs text-muted-foreground mt-1">Configure your unit scale in the Authorisations tab.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[30%]">Item Name</TableHead>
                  <TableHead className="w-[15%]">UOM</TableHead>
                  <TableHead className="text-right w-[15%]">Daily scale Auth</TableHead>
                  <TableHead className="text-right w-[15%]">Dining Strength</TableHead>
                  <TableHead className="text-right w-[25%] font-semibold text-foreground">
                    {isAlreadyPosted ? 'Committed Consumption' : 'Computed Consumption'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialItems.map((item) => (
                  <TableRow key={item.variant_id} className="hover:bg-muted/10 transition-colors">
                    <TableCell className="font-semibold text-foreground">{item.item_name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {item.auth_qty.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                      {presentCount}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-mono text-sm tabular-nums font-bold",
                      isAlreadyPosted ? "text-emerald-600 dark:text-emerald-400" : "text-primary"
                    )}>
                      {isAlreadyPosted ? (item.saved_qty ?? item.computed_qty).toFixed(4) : item.computed_qty.toFixed(4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
