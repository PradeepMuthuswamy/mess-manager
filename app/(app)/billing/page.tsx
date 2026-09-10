import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReceiptText, AlertCircle, CheckCircle2, History } from 'lucide-react';
import {
  getMyMessBills,
  getCurrentBillingPeriod,
  getSubscriptions,
  getMessBillsForPeriod,
} from '@/lib/billing/queries';
import { listDiningCandidates } from '@/lib/attendance/queries';
import { BillingOpsPanel } from './_components/billing-ops-panel';
import { BillPaymentDialog } from './_components/bill-payment-dialog';
import { BillDetailDialog } from './_components/bill-detail-dialog';
import { DraftBillsTable } from './_components/draft-bills-table';
import { EmptyState } from '@/components/shared/empty-state';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  await requireCapability('billing.read');
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;

  if (!unitId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
          Billing & Invoices
        </h1>
        <EmptyState
          icon={<AlertCircle className="size-5" />}
          title="No active unit"
          description="Please select an active unit to view billing records."
        />
      </div>
    );
  }

  const canDraftBilling = userHasCapability(user, 'billing.draft', unitId);
  const canFinalizeBilling = userHasCapability(user, 'billing.finalize', unitId);

  const [myBills, currentPeriod, subscriptions, diningCandidates] = await Promise.all([
    getMyMessBills(user.id),
    canDraftBilling ? getCurrentBillingPeriod(unitId) : Promise.resolve(null),
    canDraftBilling ? getSubscriptions(unitId) : Promise.resolve([]),
    canDraftBilling ? listDiningCandidates(unitId) : Promise.resolve([]),
  ]);

  const periodBills =
    canDraftBilling && currentPeriod
      ? await getMessBillsForPeriod(currentPeriod.id)
      : [];

  const members = diningCandidates
    .filter((c) => c.person_type === 'profile')
    .map((c) => ({ id: c.person_id, name: c.name }));

  const unpaidBills = myBills.filter((b) => b.status === 'published' || b.status === 'overdue');
  const totalOutstanding = unpaidBills.reduce(
    (acc, b) => acc + (Number(b.total_amount) - Number(b.paid_amount ?? 0)),
    0
  );
  const latestUnpaid = unpaidBills[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary mb-1">
            Officer Portal
          </p>
          <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
            Billing & Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review monthly mess bills (26th–25th cycle), view itemized ledgers, and settle dues.
          </p>
        </div>
      </div>

      {/* Mess Secretary / Admin Ops Panel */}
      {canDraftBilling && (
        <BillingOpsPanel
          unitId={unitId}
          currentPeriod={currentPeriod}
          subscriptions={subscriptions}
          members={members}
          canFinalize={canFinalizeBilling}
        />
      )}

      {canDraftBilling && currentPeriod && (
        <DraftBillsTable bills={periodBills} periodName={currentPeriod.name} />
      )}

      {/* Main Outstanding Dues Card */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border bg-gradient-to-br from-primary/5 via-transparent to-transparent md:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg font-semibold flex items-center gap-2">
              <ReceiptText className="size-5 text-primary" /> Outstanding Mess Dues
            </CardTitle>
            <CardDescription>
              {latestUnpaid?.period
                ? `Current Billing Period — ${latestUnpaid.period.start_date} to ${latestUnpaid.period.end_date}`
                : 'Consolidated dues across all 26th–25th billing cycles'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">
                  Total Amount Payable
                </p>
                <p className="text-4xl font-black font-mono tracking-tight text-foreground mt-1">
                  ₹{totalOutstanding.toFixed(2)}
                </p>
                {latestUnpaid ? (
                  <p className="text-xs text-destructive mt-1.5">
                    Due on or before {latestUnpaid.due_date}
                  </p>
                ) : (
                  <p className="text-xs text-success mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> All previous mess accounts settled
                  </p>
                )}
              </div>

              {latestUnpaid && (
                <div className="flex items-center gap-2">
                  <BillPaymentDialog
                    billId={latestUnpaid.id}
                    totalAmount={Number(latestUnpaid.total_amount)}
                    billNumber={latestUnpaid.bill_number}
                  />
                  <BillDetailDialog
                    billId={latestUnpaid.id}
                    billNumber={latestUnpaid.bill_number}
                  />
                </div>
              )}
            </div>

            {latestUnpaid && (
              <>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <span className="mb-0.5 block text-muted-foreground">Messing</span>
                    <span className="font-mono font-bold text-foreground">
                      ₹{Number(latestUnpaid.messing_amount).toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="mb-0.5 block text-muted-foreground">Bar Lounge</span>
                    <span className="font-mono font-bold text-foreground">
                      ₹{Number(latestUnpaid.bar_amount).toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="mb-0.5 block text-muted-foreground">Guest Rooms</span>
                    <span className="font-mono font-bold text-foreground">
                      ₹{Number(latestUnpaid.room_amount).toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="mb-0.5 block text-muted-foreground">Casual Guests</span>
                    <span className="font-mono font-bold text-foreground">
                      ₹{Number(latestUnpaid.guest_meal_amount).toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="mb-0.5 block text-muted-foreground">Subscriptions</span>
                    <span className="font-mono font-bold text-foreground">
                      ₹{Number(latestUnpaid.subscriptions_amount).toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="mb-0.5 block text-muted-foreground">Recoveries</span>
                    <span className="font-mono font-bold text-foreground">
                      ₹{Number(latestUnpaid.misc_amount).toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="mb-0.5 block text-muted-foreground">Party</span>
                    <span className="font-mono font-bold text-foreground">
                      ₹{Number(latestUnpaid.party_amount ?? 0).toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <span className="mb-0.5 block text-muted-foreground">Arrears</span>
                    <span className="font-mono font-bold text-foreground">
                      ₹{Number(latestUnpaid.arrears_amount ?? 0).toFixed(0)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick Info / Cycle Card */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold">
              Monthly Mess Accounting
            </CardTitle>
            <CardDescription>Rules & cycle schedules</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-muted-foreground leading-relaxed">
            <p>
              • <strong>26th–25th Cycle:</strong> Bills close on the 25th of every month and are published by the Mess Secretary.
            </p>
            <p>
              • <strong>Entitled Ration:</strong> Govt rations are issued free of charge to living-in members. Non-ration items and fresh market produce are accounted under the daily P-rate or flat tariff.
            </p>
            <p>
              • <strong>Payment Due Date:</strong> Mess bills are payable on or before the 10th of the following month.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice History */}
      <div className="space-y-4">
        <h3 className="text-lg font-heading font-semibold text-foreground flex items-center gap-2">
          <History className="size-4 text-primary" /> Monthly Mess Statements
        </h3>

        {myBills.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No monthly bills generated yet. When the 25th billing cycle closes, published statements will appear here.
            </CardContent>
          </Card>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {myBills.map((bill) => (
              <div
                key={bill.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-muted/30 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">
                      {bill.bill_number}
                    </span>
                    <Badge
                      variant={
                        bill.status === 'paid'
                          ? 'success'
                          : bill.status === 'published'
                          ? 'destructive'
                          : 'outline'
                      }
                      className="text-[10px] uppercase font-mono"
                    >
                      {bill.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {bill.period?.name ?? 'Monthly Mess Bill'} • Due on {bill.due_date}
                  </p>
                </div>

                <div className="flex items-center gap-4 justify-between sm:justify-end">
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block">Bill Total</span>
                    <span className="font-mono font-bold text-foreground text-base">
                      ₹{Number(bill.total_amount).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <BillDetailDialog billId={bill.id} billNumber={bill.bill_number} />
                    {bill.status !== 'paid' && (
                      <BillPaymentDialog
                        billId={bill.id}
                        totalAmount={Number(bill.total_amount)}
                        billNumber={bill.bill_number}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
