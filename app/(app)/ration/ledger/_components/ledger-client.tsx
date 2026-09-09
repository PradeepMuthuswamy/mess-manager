'use client';

import { useMemo, useState } from 'react';
import { AddTransactionDialog } from './add-transaction-dialog';
import type { EligibleItem } from '@/lib/ration/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type RationStockReportRow = {
  variant_id: string;
  item_name: string;
  uom: string;
  total_receipts: number;
  total_issued: number;
  total_returned: number;
  net_issued: number;
  current_balance: number;
  last_rate: number;
};

export type TransactionLogItem = {
  id: string;
  transaction_date: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
  source: string | null;
  notes: string | null;
  item_name: string;
  variant_id?: string;
};

type LedgerClientProps = {
  unitId: string;
  eligibleItems: EligibleItem[];
  reportRows: RationStockReportRow[];
  transactions: TransactionLogItem[];
  canWrite: boolean;
};

type SplitRow = {
  variant_id: string;
  item_name: string;
  uom: string;
  receipts: number;
  consumption: number;
  returns: number;
  adjustments: number;
  net: number;
  last_rate: number;
};

type TxBucket = {
  receipts: number;
  consumptionLedger: number;
  returns: number;
  adjustments: number;
};

const SOURCE_LABEL: Record<string, string> = {
  canteen: 'Canteen',
  local: 'Local',
  'govt issue': 'Govt issue',
  govt_issue: 'Govt issue',
  other: 'Other',
};

const TYPE_LABEL: Record<string, string> = {
  receipt: 'Receipt',
  adjustment: 'Adjustment',
  return_to_source: 'Return to source',
  consumption: 'Consumption',
};

function emptyBucket(): TxBucket {
  return { receipts: 0, consumptionLedger: 0, returns: 0, adjustments: 0 };
}

function txKey(tx: TransactionLogItem) {
  return tx.variant_id || tx.item_name;
}

function formatQty(n: number) {
  return n.toFixed(3);
}

function formatSignedQty(n: number) {
  if (n > 0) return `+${n.toFixed(3)}`;
  return n.toFixed(3);
}

function sourceLabel(source: string | null) {
  if (!source) return '—';
  return SOURCE_LABEL[source] ?? source;
}

function typeBadgeVariant(type: string) {
  if (type === 'receipt') return 'success' as const;
  if (type === 'adjustment') return 'warning' as const;
  if (type === 'return_to_source') return 'destructive' as const;
  if (type === 'consumption') return 'info' as const;
  return 'secondary' as const;
}

function buildSplitRows(
  reportRows: RationStockReportRow[],
  transactions: TransactionLogItem[],
): SplitRow[] {
  const byKey = new Map<string, TxBucket>();

  for (const tx of transactions) {
    const key = txKey(tx);
    const cur = byKey.get(key) ?? emptyBucket();
    if (tx.type === 'receipt') cur.receipts += tx.quantity;
    else if (tx.type === 'return_to_source') cur.returns += tx.quantity;
    else if (tx.type === 'adjustment') cur.adjustments += tx.quantity;
    else if (tx.type === 'consumption') cur.consumptionLedger += tx.quantity;
    byKey.set(key, cur);
  }

  return reportRows.map((row) => {
    const split =
      byKey.get(row.variant_id) ?? byKey.get(row.item_name) ?? emptyBucket();
    const consumption =
      split.consumptionLedger > 0 ? split.consumptionLedger : row.total_issued;
    const receipts = split.receipts;
    const returns = split.returns;
    const adjustments = split.adjustments;
    return {
      variant_id: row.variant_id,
      item_name: row.item_name,
      uom: row.uom,
      receipts,
      consumption,
      returns,
      adjustments,
      net: receipts - consumption - returns + adjustments,
      last_rate: row.last_rate,
    };
  });
}

export function LedgerClient({
  unitId,
  eligibleItems,
  reportRows,
  transactions,
  canWrite,
}: LedgerClientProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'log'>('summary');

  const splitRows = useMemo(
    () => buildSplitRows(reportRows, transactions),
    [reportRows, transactions],
  );

  const totals = useMemo(
    () =>
      splitRows.reduce(
        (acc, row) => {
          acc.receipts += row.receipts;
          acc.consumption += row.consumption;
          acc.returns += row.returns;
          acc.adjustments += row.adjustments;
          acc.net += row.net;
          return acc;
        },
        { receipts: 0, consumption: 0, returns: 0, adjustments: 0, net: 0 },
      ),
    [splitRows],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-muted/60 p-1">
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
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SplitStat label="Receipts" value={totals.receipts} />
            <SplitStat label="Consumption" value={totals.consumption} />
            <SplitStat label="Returns" value={totals.returns} />
            <SplitStat
              label="Adjustments"
              value={totals.adjustments}
              signed
            />
            <SplitStat label="Net" value={totals.net} signed emphasize />
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Receipts</TableHead>
                  <TableHead className="text-right">Consumption</TableHead>
                  <TableHead className="text-right">Returns</TableHead>
                  <TableHead className="text-right">Adjustments</TableHead>
                  <TableHead className="bg-muted/30 text-right font-semibold text-foreground">
                    Net
                  </TableHead>
                  <TableHead className="text-right">Last Purchase Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {splitRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No transactions or active scales configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  splitRows.map((row) => (
                    <TableRow key={row.variant_id}>
                      <TableCell className="font-semibold">{row.item_name}</TableCell>
                      <TableCell>{row.uom}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatQty(row.receipts)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatQty(row.consumption)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatQty(row.returns)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono text-sm tabular-nums',
                          row.adjustments < 0 && 'text-destructive',
                        )}
                      >
                        {formatSignedQty(row.adjustments)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'bg-muted/20 text-right font-mono text-sm font-bold tabular-nums',
                          row.net < 0 ? 'text-destructive' : 'text-foreground',
                        )}
                      >
                        {formatSignedQty(row.net)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        ₹{row.last_rate.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {splitRows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-semibold">
                      Totals
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatQty(totals.receipts)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatQty(totals.consumption)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatQty(totals.returns)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-sm tabular-nums',
                        totals.adjustments < 0 && 'text-destructive',
                      )}
                    >
                      {formatSignedQty(totals.adjustments)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-sm font-bold tabular-nums',
                        totals.net < 0 ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {formatSignedQty(totals.net)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </>
      )}

      {activeTab === 'log' && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No transactions recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-sm">
                      {tx.transaction_date}
                    </TableCell>
                    <TableCell className="font-medium">{tx.item_name}</TableCell>
                    <TableCell>
                      <Badge variant={typeBadgeVariant(tx.type)}>
                        {TYPE_LABEL[tx.type] ?? tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-sm tabular-nums',
                        tx.quantity < 0 && 'text-destructive',
                      )}
                    >
                      {tx.type === 'adjustment'
                        ? formatSignedQty(tx.quantity)
                        : formatQty(tx.quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      ₹{tx.rate.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      ₹{tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>{sourceLabel(tx.source)}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {tx.notes || '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SplitStat({
  label,
  value,
  signed = false,
  emphasize = false,
}: {
  label: string;
  value: number;
  signed?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-mono text-lg tabular-nums',
          emphasize ? 'font-bold' : 'font-semibold',
          value < 0 ? 'text-destructive' : 'text-foreground',
        )}
      >
        {signed ? formatSignedQty(value) : formatQty(value)}
      </p>
    </div>
  );
}
