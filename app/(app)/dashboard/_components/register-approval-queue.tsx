'use client';

import { useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  approveDailyRegisterAction,
  rejectDailyRegisterAction,
} from '@/lib/messing/actions';
import type { PendingRegisterView } from '@/lib/messing/types';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import Link from 'next/link';

export function RegisterApprovalQueue({
  pending,
  canApprove,
}: {
  pending: PendingRegisterView[];
  canApprove: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Register approval
          <Link
            href="/messing"
            className="font-mono text-[10px] font-medium normal-case text-primary hover:underline"
          >
            Open
          </Link>
        </CardTitle>
        <CardDescription>Submitted daily registers awaiting Food Member review</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">No registers waiting for approval.</p>
        ) : (
          pending.map((row) => (
            <div key={row.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {format(parseISO(row.expenditure_date), 'dd MMM yyyy')}
                </span>
                <Badge variant="warning" className="font-mono text-[10px] capitalize">
                  {row.register_status}
                </Badge>
              </div>
              <p className="font-mono text-sm font-semibold text-foreground">
                ₹{Number(row.total_amount).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                B ₹{Number(row.morning_amount).toFixed(0)} · L ₹
                {Number(row.afternoon_amount).toFixed(0)} · D ₹
                {Number(row.dinner_amount).toFixed(0)}
                {row.vendor_name ? ` · ${row.vendor_name}` : ''}
              </p>
              {canApprove && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await approveDailyRegisterAction({
                          unit_id: row.unit_id,
                          expenditure_date: row.expenditure_date,
                        });
                        if ('error' in res) toast.error(res.error);
                        else toast.success('Register approved');
                      });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => {
                      const reason = window.prompt('Reject reason (optional)');
                      if (reason === null) return;
                      startTransition(async () => {
                        const res = await rejectDailyRegisterAction({
                          unit_id: row.unit_id,
                          expenditure_date: row.expenditure_date,
                          reject_reason: reason.trim() || undefined,
                        });
                        if ('error' in res) toast.error(res.error);
                        else toast.success('Register rejected');
                      });
                    }}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
