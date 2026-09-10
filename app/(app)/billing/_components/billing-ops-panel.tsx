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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createBillingPeriodAction,
  runMonthlyBillingAction,
  publishBillingPeriodAction,
  createSubscriptionAction,
  createMiscDebitAction,
  deactivateSubscriptionAction,
  createPartyChargeAction,
} from '@/lib/billing/actions';
import { deriveStandardBillingCycle } from '@/lib/billing/compute';
import type { MessBillingPeriodRow, MessSubscriptionRow } from '@/lib/billing/types';
import { Play, Send, Plus, Calendar, ShieldCheck, Loader2, Ban, PartyPopper, Receipt } from 'lucide-react';
import { toast } from 'sonner';

export type BillingMemberOption = {
  id: string;
  name: string;
};

const MISC_CATEGORIES = [
  { value: 'personal_recovery', label: 'Personal recovery' },
  { value: 'damage_breakage', label: 'Damage / breakage' },
  { value: 'laundry_tailor', label: 'Laundry / tailor' },
  { value: 'sports_club', label: 'Sports / club' },
  { value: 'other', label: 'Other' },
] as const;

interface BillingOpsPanelProps {
  unitId: string;
  currentPeriod: MessBillingPeriodRow | null;
  subscriptions: MessSubscriptionRow[];
  members: BillingMemberOption[];
  canFinalize: boolean;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function BillingOpsPanel({
  unitId,
  currentPeriod,
  subscriptions,
  members,
  canFinalize,
}: BillingOpsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showMiscModal, setShowMiscModal] = useState(false);
  const [showPartyModal, setShowPartyModal] = useState(false);

  const now = new Date();
  const currentMonth = now.getDate() >= 26 ? now.getMonth() + 2 : now.getMonth() + 1;
  const suggestedYear = now.getFullYear();
  const defaultCycle = deriveStandardBillingCycle(suggestedYear, currentMonth > 12 ? 1 : currentMonth);

  const [periodName, setPeriodName] = useState(defaultCycle.name);
  const [startDate, setStartDate] = useState(defaultCycle.startDate);
  const [endDate, setEndDate] = useState(defaultCycle.endDate);
  const [billingYear, setBillingYear] = useState(suggestedYear);
  const [billingMonth, setBillingMonth] = useState(currentMonth > 12 ? 1 : currentMonth);

  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState(150);

  const [miscProfileId, setMiscProfileId] = useState('');
  const [miscDate, setMiscDate] = useState(todayIso);
  const [miscCategory, setMiscCategory] = useState<(typeof MISC_CATEGORIES)[number]['value']>(
    'personal_recovery'
  );
  const [miscDescription, setMiscDescription] = useState('');
  const [miscAmount, setMiscAmount] = useState(0);
  const [miscRef, setMiscRef] = useState('');

  const [partyProfileId, setPartyProfileId] = useState('');
  const [partyDate, setPartyDate] = useState(todayIso);
  const [partyDescription, setPartyDescription] = useState('');
  const [partyAmount, setPartyAmount] = useState(0);

  const runDisabled =
    isPending ||
    !currentPeriod ||
    currentPeriod.status === 'published' ||
    currentPeriod.status === 'closed';

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

  const handleDeactivateSubscription = (subscriptionId: string, name: string) => {
    startTransition(async () => {
      const res = await deactivateSubscriptionAction(subscriptionId);
      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success(`Subscription "${name}" deactivated.`);
      }
    });
  };

  const handleCreateMiscDebit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createMiscDebitAction({
        unit_id: unitId,
        profile_id: miscProfileId,
        charge_date: miscDate,
        category: miscCategory,
        description: miscDescription,
        amount: miscAmount,
        receipt_ref: miscRef || undefined,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success('Miscellaneous debit recorded.');
        setShowMiscModal(false);
        setMiscDescription('');
        setMiscAmount(0);
        setMiscRef('');
      }
    });
  };

  const handleCreatePartyCharge = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createPartyChargeAction({
        unit_id: unitId,
        profile_id: partyProfileId,
        party_date: partyDate,
        description: partyDescription,
        amount: partyAmount,
      });

      if ('error' in res) {
        toast.error(res.error);
      } else {
        toast.success('Party charge recorded.');
        setShowPartyModal(false);
        setPartyDescription('');
        setPartyAmount(0);
      }
    });
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
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

          <div className="flex flex-wrap items-center gap-2">
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
                      {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
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
                      Recurring monthly fund charged to all dining officers (e.g. Mess Maintenance,
                      Library, Sports).
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

            <Dialog open={showMiscModal} onOpenChange={setShowMiscModal}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Receipt className="size-4" />
                  Misc debit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <form onSubmit={handleCreateMiscDebit}>
                  <DialogHeader>
                    <DialogTitle>Record miscellaneous debit</DialogTitle>
                    <DialogDescription>
                      Ad-hoc recovery charged to a member on the next billing run.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <MemberSelect
                      id="misc-member"
                      label="Member"
                      members={members}
                      value={miscProfileId}
                      onChange={setMiscProfileId}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="misc-date">Charge date</Label>
                        <Input
                          id="misc-date"
                          type="date"
                          value={miscDate}
                          onChange={(e) => setMiscDate(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Select
                          value={miscCategory}
                          onValueChange={(v) =>
                            setMiscCategory(v as (typeof MISC_CATEGORIES)[number]['value'])
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MISC_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="misc-desc">Description</Label>
                      <Input
                        id="misc-desc"
                        value={miscDescription}
                        onChange={(e) => setMiscDescription(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="misc-amt">Amount (₹)</Label>
                        <Input
                          id="misc-amt"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={miscAmount || ''}
                          onChange={(e) => setMiscAmount(parseFloat(e.target.value) || 0)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="misc-ref">Receipt ref</Label>
                        <Input
                          id="misc-ref"
                          value={miscRef}
                          onChange={(e) => setMiscRef(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowMiscModal(false)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isPending || !miscProfileId}>
                      {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                      Record debit
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={showPartyModal} onOpenChange={setShowPartyModal}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <PartyPopper className="size-4" />
                  Party charge
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <form onSubmit={handleCreatePartyCharge}>
                  <DialogHeader>
                    <DialogTitle>Record party charge</DialogTitle>
                    <DialogDescription>
                      Function / party recovery billed to a member on the next run.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <MemberSelect
                      id="party-member"
                      label="Member"
                      members={members}
                      value={partyProfileId}
                      onChange={setPartyProfileId}
                    />
                    <div className="space-y-1.5">
                      <Label htmlFor="party-date">Party date</Label>
                      <Input
                        id="party-date"
                        type="date"
                        value={partyDate}
                        onChange={(e) => setPartyDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="party-desc">Description</Label>
                      <Input
                        id="party-desc"
                        value={partyDescription}
                        onChange={(e) => setPartyDescription(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="party-amt">Amount (₹)</Label>
                      <Input
                        id="party-amt"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={partyAmount || ''}
                        onChange={(e) => setPartyAmount(parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowPartyModal(false)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isPending || !partyProfileId}>
                      {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                      Record charge
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
          <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{currentPeriod.name}</span>
                <Badge variant="outline" className="font-mono text-[10px] uppercase">
                  {currentPeriod.status}
                </Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                Cycle: {currentPeriod.start_date} → {currentPeriod.end_date} (Closes 25th)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleRunBilling}
                disabled={runDisabled}
                className="gap-1.5"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
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
          <div className="rounded-lg border border-border bg-background p-4 text-center text-sm text-muted-foreground">
            No active billing period open. Click <strong>New Cycle Period</strong> to open the
            26th–25th billing cycle.
          </div>
        )}

        {subscriptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Monthly subscriptions:</span>
            {subscriptions.map((s) => (
              <Badge key={s.id} variant="secondary" className="gap-1.5 font-mono font-normal">
                {s.name}: ₹{Number(s.amount).toFixed(0)}
                {s.is_active === false ? (
                  <span className="text-muted-foreground">· inactive</span>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center text-destructive hover:underline"
                    disabled={isPending}
                    onClick={() => handleDeactivateSubscription(s.id, s.name)}
                  >
                    <Ban className="mr-0.5 size-3" />
                    Deactivate
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemberSelect({
  id,
  label,
  members,
  value,
  onChange,
}: {
  id: string;
  label: string;
  members: BillingMemberOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} required>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select member" />
        </SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
