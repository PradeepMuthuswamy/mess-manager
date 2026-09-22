import { requireCapability } from '@/lib/auth/require-capability';
import { listRequestedMealCuts } from '@/lib/messing/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { MealCutQueue } from '../_components/meal-cut-queue';

export const dynamic = 'force-dynamic';

export default async function MealCutQueuePage() {
  const user = await requireCapability('attendance.write');
  const unitId = user.activeUnitId ?? user.homeUnitId;

  if (!unitId) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
          Messing
        </h1>
        <EmptyState
          icon={<AlertCircle className="size-5" />}
          title="No active unit"
          description="Select a unit to review messing requests."
        />
      </div>
    );
  }

  const cuts = await listRequestedMealCuts(unitId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-primary">
            Messing
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Messing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve or reject requested messing for the unit.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/messing">Back to messing</Link>
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-heading text-base font-semibold">Requests</CardTitle>
          <CardDescription>
            {cuts.length === 0
              ? 'The queue is empty.'
              : `${cuts.length} request${cuts.length === 1 ? '' : 's'} awaiting review.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MealCutQueue unitId={unitId} cuts={cuts} />
        </CardContent>
      </Card>
    </div>
  );
}
