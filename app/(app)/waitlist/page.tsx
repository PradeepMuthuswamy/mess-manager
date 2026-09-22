import { requireUser } from '@/lib/auth/require-role';
import { listMyWaitlist } from '@/lib/waitlist/queries';
import { WaitlistForm } from './_components/waitlist-form';
import { CancelWaitlistButton } from './_components/cancel-waitlist-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { BedDouble } from 'lucide-react';
import { formatStayDate } from '@/lib/waitlist/types';

export const dynamic = 'force-dynamic';

export default async function WaitlistPage() {
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;

  if (!unitId) {
    return (
      <EmptyState
        icon={<BedDouble className="size-5" />}
        title="No active unit"
        description="Assign a unit to request a guest room."
      />
    );
  }

  const rows = await listMyWaitlist(unitId, user.id).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-primary">Guest rooms</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
          Room requests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask for a guest room when none is free. The clerk offers a room, then books it. This is not a confirmed stay until then.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base">New request</CardTitle>
          <CardDescription>This is not a confirmed booking. Check-out must be after check-in.</CardDescription>
        </CardHeader>
        <CardContent>
          <WaitlistForm unitId={unitId} />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base">Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open room requests.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">{row.guest_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatStayDate(row.requested_from, 'dd MMM')} –{' '}
                      {formatStayDate(row.requested_to, 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {row.status}
                    </Badge>
                    {(row.status === 'requested' || row.status === 'offered') && (
                      <CancelWaitlistButton id={row.id} unitId={unitId} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
