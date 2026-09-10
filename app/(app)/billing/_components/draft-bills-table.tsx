import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MessBillWithDetails } from '@/lib/billing/types';
import { FileSpreadsheet } from 'lucide-react';
import { BillDetailDialog } from './bill-detail-dialog';

function inr(value: number) {
  return `₹${value.toFixed(2)}`;
}

function memberName(bill: MessBillWithDetails) {
  const rank = bill.profile?.rank?.trim();
  const name = bill.profile?.full_name?.trim();
  const label = [rank, name].filter(Boolean).join(' ');
  return label || 'Member';
}

function billStatusVariant(status: string) {
  if (status === 'paid') return 'success' as const;
  if (status === 'published' || status === 'overdue') return 'destructive' as const;
  return 'outline' as const;
}

export function DraftBillsTable({
  bills,
  periodName,
}: {
  bills: MessBillWithDetails[];
  periodName: string;
}) {
  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
        <FileSpreadsheet className="size-4 text-primary" />
        Draft bills — {periodName}
      </h3>

      {bills.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No bills compiled for this cycle yet. Run the monthly billing engine to generate draft
            statements.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Bill number</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Party</TableHead>
                <TableHead className="text-right">Arrears</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Statement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => {
                const party = Number(bill.party_amount ?? 0);
                const arrears = Number(bill.arrears_amount ?? 0);
                return (
                  <TableRow key={bill.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{memberName(bill)}</div>
                      {bill.profile?.service_no && (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {bill.profile.service_no}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-foreground">
                      {bill.bill_number}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-foreground">
                      {inr(Number(bill.total_amount))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-foreground">
                      {party > 0 ? inr(party) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-foreground">
                      {arrears > 0 ? inr(arrears) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={billStatusVariant(bill.status)}
                        className="font-mono text-[10px] uppercase"
                      >
                        {bill.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <BillDetailDialog billId={bill.id} billNumber={bill.bill_number} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
