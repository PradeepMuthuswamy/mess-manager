import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import { listMyPartyCharges, listUpcomingParties } from '@/lib/parties/queries';
import { CreatePartyForm } from './_components/create-party-form';
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

export default async function PartyPage() {
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;
  const canWrite =
    !!unitId &&
    (userHasCapability(user, 'parties.write', unitId) ||
      user.role === 'unit_admin' ||
      user.role === 'mess_secretary');

  if (!unitId) {
    return (
      <EmptyState
        icon={<PartyPopper className="size-5" />}
        title="No active unit"
        description="Assign a unit to see mess parties."
      />
    );
  }

  const [parties, charges] = await Promise.all([
    listUpcomingParties(unitId, todayIso()).catch(() => []),
    listMyPartyCharges(unitId, user.id).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-primary">Social</p>
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
            <CreatePartyForm unitId={unitId} />
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
              {parties.map((party) => (
                <li key={party.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">{party.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(party.party_date), 'dd MMM yyyy')}
                      {party.venue ? ` · ${party.venue}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit capitalize">
                    {party.party_type}
                  </Badge>
                </li>
              ))}
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
                  <span className="font-mono">{inr(row.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
