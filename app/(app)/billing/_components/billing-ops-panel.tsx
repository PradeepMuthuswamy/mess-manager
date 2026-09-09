'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createBillingPeriodAction,
  runMonthlyBillingAction,
  publishBillingPeriodAction,
  createSubscriptionAction,
} from '@/lib/billing/actions';
import { deriveStandardBillingCycle } from '@/lib/billing/compute';
import type { MessBillingPeriodRow, MessSubscriptionRow } from '@/lib/billing/types';
import { Play, Send, Plus, Calendar, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface BillingOpsPanelProps {
  unitId: string;
  currentPeriod: MessBillingPeriodRow | null;
  subscriptions: MessSubscriptionRow[];
  canFinalize: boolean;
}

export function BillingOpsPanel({
  unitId,
  currentPeriod,
  subscriptions,
  canFinalize,
}: BillingOpsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);

  // Suggested next 26th-to-25th period
  const now = new Date();
  const currentMonth = now.getDate() >= 26 ? now.getMonth() + 2 : now.getMonth() + 1;
  const suggestedYear = now.getFullYear();
  const defaultCycle = deriveStandardBillingCycle(suggestedYear, currentMonth > 12 ? 1 : currentMonth);

  const [periodName, setPeriodName] = useState(defaultCycle.name);
  const [startDate, setStartDate] = useState(defaultCycle.startDate);
  const [endDate, setEndDate] = useState(defaultCycle.endDate);
  const [billingYear, setBillingYear] = useState(suggestedYear);
  const [billingMonth, setBillingMonth] = useState(currentMonth > 12 ? 1 : currentMonth);

  // Subscription state
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState(150);

  const handleCreatePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createBillingPeriodAction({
        unit_id: unitId,
        name: periodName,
        start_date: startDate,
        end_date: endDate,
        billing_year: billingYear,
        billing_month: billingMonth,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Billing period "${periodName}" opened!`);
        setShowNewPeriod(false);
      }
    });
  };

  const handleRunBilling = () => {
    if (!currentPeriod) return;
    startTransition(async () => {
      const res = await runMonthlyBillingAction({
        unit_id: unitId,
        billing_period_id: currentPeriod.id,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        const data = res.data as { generatedBillsCount: number };
        toast.success(
          `Monthly calculation complete! Compiled ${data.generatedBillsCount} member mess bills.`
        );
      }
    });
  };

  const handlePublishBills = () => {
    if (!currentPeriod) return;
    startTransition(async () => {
      const res = await publishBillingPeriodAction({
        billing_period_id: currentPeriod.id,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Monthly bills published! Officers can now review and settle dues.`);
      }
    });
  };

  const handleAddSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createSubscriptionAction({
        unit_id: unitId,
        name: subName,
        amount: subAmount,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Subscription "${subName}" added.`);
        setShowSubModal(false);
        setSubName('');
      }
    });
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <CardTitle className="font-heading text-lg font-semibold">
                Mess Secretary Operations (26th–25th Cycle)
              </CardTitle>
            </div>
            <CardDescription>
              Execute monthly billing run, consolidate operational ledgers, and publish officer dues.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Dialog open={showNewPeriod} onOpenChange={setShowNewPeriod}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Calendar className="size-4" />
                  New Cycle Period
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <form onSubmit={handleCreatePeriod}>
                  <DialogHeader>
                    <DialogTitle>Open 26th–25th Billing Period</DialogTitle>
                    <DialogDescription>
                      Standard cycle runs from the 26th of previous month to the 25th of current month.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="pName">Period Name</Label>
                      <Input
                        id="pName"
                        value={periodName}
                        onChange={(e) => setPeriodName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="start">Cycle Start (26th)</Label>
                        <Input
                          id="start"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="end">Cycle End (25th)</Label>
                        <Input
                          id="end"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowNewPeriod(false)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isPending}>
                      {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                      Open Billing Period
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={showSubModal} onOpenChange={setShowSubModal}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="size-4" />
                  Add Subscription
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <form onSubmit={handleAddSubscription}>
                  <DialogHeader>
                    <DialogTitle>Add Mess Subscription</DialogTitle>
                    <DialogDescription>
                      Recurring monthly fund charged to all dining officers (e.g. Mess Maintenance, Library, Sports).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="sName">Fund / Subscription Name</Label>
                      <Input
                        id="sName"
                        placeholder="e.g. Mess Maintenance Fund"
                        value={subName}
                        onChange={(e) => setSubName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sAmt">Monthly Amount (₹)</Label>
                      <Input
                        id="sAmt"
                        type="number"
                        min="0"
                        value={subAmount}
                        onChange={(e) => setSubAmount(parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowSubModal(false)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isPending}>
                      Save Subscription
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentPeriod ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-background border border-border gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{currentPeriod.name}</span>
                <Badge variant="outline" className="uppercase font-mono text-[10px]">
                  {currentPeriod.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Cycle: {currentPeriod.start_date} → {currentPeriod.end_date} (Closes 25th)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleRunBilling}
                disabled={isPending || currentPeriod.status === 'closed'}
                className="gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Run Monthly Billing Engine
              </Button>

              {canFinalize && currentPeriod.status === 'draft' && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handlePublishBills}
                  disabled={isPending}
                  className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                >
                  <Send className="size-4" />
                  Publish Bills to Officers
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-background border border-border text-center text-sm text-muted-foreground">
            No active billing period open. Click <strong>New Cycle Period</strong> to open the 26th–25th billing cycle.
          </div>
        )}

        {/* Subscriptions list preview */}
        {subscriptions.length > 0 && (
          <div className="text-xs flex items-center gap-3 text-muted-foreground flex-wrap pt-1">
            <span className="font-medium text-foreground">Active Monthly Subscriptions:</span>
            {subscriptions.map((s) => (
              <Badge key={s.id} variant="secondary" className="font-mono font-normal">
                {s.name}: ₹{Number(s.amount).toFixed(0)}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
