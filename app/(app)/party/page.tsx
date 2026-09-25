import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import { listUnitMembers } from '@/lib/bar/queries';
import {
  listMyPartyCharges,
  listPartyCostLinesByPartyIds,
  listPartyGuestsByPartyIds,
  listUpcomingParties,
} from '@/lib/parties/queries';
import type { MessParty, MessPartyCostLine, MessPartyGuest, PartyBudgetStatus } from '@/lib/parties/types';
import { CreatePartyForm } from './_components/create-party-form';
import { PartyCostsForm } from './_components/party-costs-form';
import { PartyGuestsForm } from './_components/party-guests-form';
import { PartyLifecycleButtons } from './_components/party-lifecycle-buttons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PartyPopper } from 'lucide-react';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inr(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BUDGET_BADGE: Record<
  PartyBudgetStatus,
  { label: string; variant: 'outline' | 'warning' | 'success' | 'destructive' }
> = {
  draft: { label: 'Budget draft', variant: 'outline' },
  submitted: { label: 'Budget submitted', variant: 'warning' },
  approved: { label: 'Budget approved', variant: 'success' },
  rejected: { label: 'Budget rejected', variant: 'destructive' },
};

function asBudgetStatus(value: string | null | undefined): PartyBudgetStatus {
  if (value === 'submitted' || value === 'approved' || value === 'rejected') return value;
  return 'draft';
}

function costTotalOf(party: { ration_cost?: number; bar_cost?: number; catering_cost?: number }, lines: MessPartyCostLine[]) {
  if (lines.length > 0) return lines.reduce((sum, line) => sum + Number(line.amount), 0);
  return Number(party.ration_cost ?? 0) + Number(party.bar_cost ?? 0) + Number(party.catering_cost ?? 0);
}

export default async function PartyPage() {
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;
  const canWrite = !!unitId && userHasCapability(user, 'parties.write', unitId);

  if (!unitId) {
    return (
      <EmptyState
        icon={<PartyPopper className="size-5" />}
        title="No active unit"
        description="Assign a unit to see mess parties."
      />
    );
  }

  const canApprove = userHasCapability(user, 'billing.finalize', unitId);
  const canFinalize =
    userHasCapability(user, 'parties.finalize', unitId) ||
    userHasCapability(user, 'billing.draft', unitId);

  const [parties, charges, hosts] = await Promise.all([
    listUpcomingParties(unitId, todayIso()).catch(() => []),
    listMyPartyCharges(unitId, user.id).catch(() => []),
    canWrite ? listUnitMembers(unitId).catch(() => []) : Promise.resolve([]),
  ]);

  const partyIds = parties.map((party: MessParty) => party.id);
  const [allGuests, allCostLines] = await Promise.all([
    listPartyGuestsByPartyIds(partyIds).catch((): MessPartyGuest[] => []),
    listPartyCostLinesByPartyIds(partyIds).catch((): MessPartyCostLine[] => []),
  ]);
  const guestsByParty = new Map<string, MessPartyGuest[]>();
  const costsByParty = new Map<string, MessPartyCostLine[]>();
  for (const guest of allGuests) {
    const list = guestsByParty.get(guest.party_id) ?? [];
    list.push(guest);
    guestsByParty.set(guest.party_id, list);
  }
  for (const line of allCostLines) {
    const list = costsByParty.get(line.party_id) ?? [];
    list.push(line);
    costsByParty.set(line.party_id, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Social</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">Parties</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upcoming dining-ins and hosted nights. Individual charges appear on your mess bill.
        </p>
      </div>

      {canWrite && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-heading text-base">Schedule a party</CardTitle>
            <CardDescription>Mess-funded or charged to the host officer.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreatePartyForm unitId={unitId} hosts={hosts ?? []} />
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base">Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          {parties.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming parties scheduled.</p>
          ) : (
            <ul className="divide-y divide-border">
              {parties.map((party) => {
                const guests = guestsByParty.get(party.id) ?? [];
                const costLines = costsByParty.get(party.id) ?? [];
                const budgetStatus = asBudgetStatus(party.budget_status);
                const budgetBadge = BUDGET_BADGE[budgetStatus];
                const guestCount = guests.length;
                const expected = party.expected_headcount;
                const costTotal = costTotalOf(party, costLines);

                return (
                  <li key={party.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col gap-1">
                        <p className="font-medium text-foreground">{party.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(party.party_date), 'dd MMM yyyy')}
                          {party.venue ? ` · ${party.venue}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Budget {inr(Number(party.budget_amount ?? 0))}
                          <span className="mx-1.5 text-muted-foreground">·</span>
                          Costs {inr(costTotal)}
                          <span className="mx-1.5 text-muted-foreground">·</span>
                          {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
                          {expected != null ? ` / ${expected} expected` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="w-fit capitalize">
                          {party.party_type}
                        </Badge>
                        <Badge variant={budgetBadge.variant} className="w-fit">
                          {budgetBadge.label}
                        </Badge>
                        <Badge variant="outline" className="w-fit capitalize">
                          {party.status}
                        </Badge>
                      </div>
                    </div>

                    {canWrite && (
                      <div className="flex flex-col gap-4">
                        <PartyLifecycleButtons
                          partyId={party.id}
                          unitId={unitId}
                          budgetStatus={budgetStatus}
                          status={party.status}
                          canApprove={canApprove}
                          canFinalize={canFinalize}
                        />
                        <div className="grid gap-6 lg:grid-cols-2">
                          <PartyCostsForm partyId={party.id} unitId={unitId} costLines={costLines} />
                          <PartyGuestsForm partyId={party.id} guests={guests} />
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base">Your party charges</CardTitle>
          <CardDescription>Unbilled amounts will roll into the next published mess bill.</CardDescription>
        </CardHeader>
        <CardContent>
          {charges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No party charges on your account.</p>
          ) : (
            <ul className="divide-y divide-border">
              {charges.map((row) => (
                <li key={row.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="text-foreground">{row.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(row.party_date), 'dd MMM yyyy')}
                      {row.is_billed ? ' · billed' : ' · pending bill'}
                    </p>
                  </div>
                  <span className="font-mono tabular">{inr(row.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
