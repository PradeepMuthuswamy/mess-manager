'use client';

import { savingLabel } from '@/components/shared/save-submit';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { postDailyRationConsumptionAction, rollbackDailyRationConsumptionAction } from '@/lib/ration/actions';
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
import { AlertCircle, CheckCircle2, Trash2, ArrowDownRight } from 'lucide-react';

type ConsumptionItem = {
  variant_id: string;
  item_name: string;
  uom: string;
  auth_qty: number;
  computed_qty: number;
  saved_qty: number | null;
  is_posted: boolean;
};

type ConsumptionFormProps = {
  unitId: string;
  date: string;
  attendanceStatus: 'draft' | 'finalized' | 'none';
  presentCount: number;
  initialItems: ConsumptionItem[];
  canWrite: boolean;
};

function attendanceBlockReason(
  attendanceStatus: ConsumptionFormProps['attendanceStatus'],
): string | null {
  if (attendanceStatus === 'none') {
    return 'Posting is disabled — no attendance record for this date. Finalize attendance first.';
  }
  if (attendanceStatus === 'draft') {
    return 'Posting is disabled — attendance is still draft. Finalize it first.';
  }
  return null;
}

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
  const attendanceFinalized = attendanceStatus === 'finalized';
  const canPost = attendanceFinalized && presentCount > 0;
  const postBlockedReason = !canPost
    ? (attendanceBlockReason(attendanceStatus) ??
      (presentCount <= 0
        ? 'Posting is disabled — dining strength is 0.'
        : null))
    : null;

  const handlePost = () => {
    if (!attendanceFinalized) {
      toast.error(
        attendanceBlockReason(attendanceStatus) ??
          'Cannot post until attendance for this date is finalized.',
      );
      return;
    }

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

      if (!res.ok) {
        toast.error(res.error ?? 'Could not post consumption.');
        return;
      }

      toast.success('Consumption posted and stock ledger updated');
      router.refresh();
    });
  };

  const handleRollback = () => {
    if (
      !confirm(
        'Roll back this day\'s consumption? This will restore stock ledger quantities.',
      )
    ) {
      return;
    }

    startTransition(async () => {
      const res = await rollbackDailyRationConsumptionAction({
        unit_id: unitId,
        consumption_date: date,
      });

      if (!res.ok) {
        toast.error(res.error ?? 'Could not roll back consumption.');
        return;
      }

      toast.success('Consumption rolled back and stock ledger restored');
      router.refresh();
    });
  };

  const attendanceHref = `/attendance?date=${date}`;

  return (
    <div className="space-y-6">
      {isAlreadyPosted ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Consumption posted</AlertTitle>
          <AlertDescription>
            Consumption posted and stock ledger updated for {date}. Stock
            quantities were decremented by the committed amounts below.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {attendanceStatus === 'none' && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Attendance required</AlertTitle>
              <AlertDescription>
                No attendance record for this date. Posting is disabled until
                dining strength is finalized in the{' '}
                <Link href={attendanceHref}>Attendance module</Link>.
              </AlertDescription>
            </Alert>
          )}

          {attendanceStatus === 'draft' && (
            <Alert>
              <AlertCircle />
              <AlertTitle>Finalize attendance to post</AlertTitle>
              <AlertDescription>
                Dining strength is still draft. Posting is disabled until
                attendance is finalized in the{' '}
                <Link href={attendanceHref}>Attendance module</Link>.
              </AlertDescription>
            </Alert>
          )}

          {attendanceStatus === 'finalized' && (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>Attendance finalized</AlertTitle>
              <AlertDescription>
                Dining strength is locked at <strong>{presentCount}</strong>.
                You can post consumption to the stock ledger.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-muted/20 p-5">
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground">Consumption Calculation</h3>
            <p className="text-xs text-muted-foreground">
              Formula:{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                Scale Authorisation Qty
              </code>{' '}
              &times;{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                Total Present Count ({presentCount})
              </code>
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-col items-end gap-1.5">
              {isAlreadyPosted ? (
                <Button
                  variant="destructive"
                  onClick={handleRollback}
                  disabled={isPending}
                  className="gap-2"
                >
                  {savingLabel(
                    isPending,
                    <>
                      <Trash2 className="size-4" />
                      Rollback Post
                    </>,
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handlePost}
                    disabled={isPending || !canPost}
                    title={postBlockedReason ?? undefined}
                    className="gap-2"
                  >
                    {savingLabel(
                      isPending,
                      <>
                        <ArrowDownRight className="size-4" />
                        Post Daily Consumption
                      </>,
                    )}
                  </Button>
                  {postBlockedReason ? (
                    <p className="max-w-xs text-right text-xs text-muted-foreground">
                      {postBlockedReason}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>

        {initialItems.length === 0 ? (
          <div className="bg-card py-16 text-center text-muted-foreground">
            <p className="text-sm font-medium">
              No scale or active items configured for this unit.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure your unit scale in the Authorisations tab.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[30%]">Item Name</TableHead>
                  <TableHead className="w-[15%]">UOM</TableHead>
                  <TableHead className="w-[15%] text-right">Daily scale Auth</TableHead>
                  <TableHead className="w-[15%] text-right">Dining Strength</TableHead>
                  <TableHead className="w-[25%] text-right font-semibold text-foreground">
                    {isAlreadyPosted ? 'Committed Consumption' : 'Computed Consumption'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialItems.map((item) => (
                  <TableRow key={item.variant_id} className="hover:bg-muted/10">
                    <TableCell className="font-semibold text-foreground">
                      {item.item_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.uom}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {item.auth_qty.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                      {presentCount}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-sm font-bold tabular-nums',
                        isAlreadyPosted ? 'text-foreground' : 'text-primary',
                      )}
                    >
                      {isAlreadyPosted
                        ? (item.saved_qty ?? item.computed_qty).toFixed(4)
                        : item.computed_qty.toFixed(4)}
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
