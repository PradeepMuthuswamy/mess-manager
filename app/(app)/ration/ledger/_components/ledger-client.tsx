'use client';

import { useState } from 'react';
import { AddTransactionDialog } from './add-transaction-dialog';
import type { EligibleItem, RationStockReportRow } from '@/lib/ration/queries';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type TransactionLogItem = {
  id: string;
  transaction_date: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
  source: string | null;
  notes: string | null;
  item_name: string;
};

type LedgerClientProps = {
  unitId: string;
  eligibleItems: EligibleItem[];
  reportRows: RationStockReportRow[];
  transactions: TransactionLogItem[];
  canWrite: boolean;
};

export function LedgerClient({
  unitId,
  eligibleItems,
  reportRows,
  transactions,
  canWrite,
}: LedgerClientProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'log'>('summary');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-muted/60 p-1 rounded-lg border border-border">
          <Button
            size="sm"
            variant={activeTab === 'summary' ? 'default' : 'ghost'}
            className="rounded-md"
            onClick={() => setActiveTab('summary')}
          >
            Stock Summary
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'log' ? 'default' : 'ghost'}
            className="rounded-md"
            onClick={() => setActiveTab('log')}
          >
            Transaction Log
          </Button>
        </div>
        {canWrite && (
          <AddTransactionDialog unitId={unitId} eligibleItems={eligibleItems} />
        )}
      </div>

      {activeTab === 'summary' && (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Total Receipts</TableHead>
                <TableHead className="text-right">Total Consumed</TableHead>
                <TableHead className="text-right bg-muted/30 font-semibold text-foreground">Current Stock Balance</TableHead>
                <TableHead className="text-right">Last Purchase Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No transactions or active scales configured.
                  </TableCell>
                </TableRow>
              ) : (
                reportRows.map((row) => (
                  <TableRow key={row.variant_id}>
                    <TableCell className="font-semibold">{row.item_name}</TableCell>
                    <TableCell>{row.uom}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {row.total_receipts.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {row.total_issued.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums bg-muted/20 font-bold text-foreground">
                      {row.current_balance.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      ₹{row.last_rate.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === 'log' && (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Source / Voucher</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No transactions recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => {
                  const isReceipt = tx.type === 'receipt';
                  const isAdjustment = tx.type === 'adjustment';

                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-sm">{tx.transaction_date}</TableCell>
                      <TableCell className="font-medium">{tx.item_name}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                            isReceipt && "bg-emerald-500/10 text-emerald-600 ring-emerald-600/20 dark:text-emerald-500",
                            isAdjustment && "bg-amber-500/10 text-amber-600 ring-amber-600/20 dark:text-amber-500",
                            tx.type === 'return_to_source' && "bg-destructive/10 text-destructive ring-destructive/20"
                          )}
                        >
                          {isReceipt && 'Receipt'}
                          {isAdjustment && 'Adjustment'}
                          {tx.type === 'return_to_source' && 'Return to Source'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {tx.quantity.toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        ₹{tx.rate.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums font-semibold">
                        ₹{tx.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>{tx.source || '—'}</TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {tx.notes || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
