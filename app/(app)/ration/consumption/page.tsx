import { requireUser } from '@/lib/auth/require-role';
import { requireCapability, userHasCapability } from '@/lib/auth/require-capability';
import { getDailyRationConsumption } from '@/lib/ration/queries';
import { EmptyState } from '@/components/shared/empty-state';
import { DateSelector } from './_components/date-selector';
import { ConsumptionForm } from './_components/consumption-form';

export const dynamic = 'force-dynamic';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DailyConsumptionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  await requireCapability('ration.read', user.activeUnitId ?? undefined);

  if (!user.activeUnitId) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Daily Consumption
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and commit daily unit ration consumption based on dining strength.
          </p>
        </header>
        <EmptyState
          title="Pick a unit to continue"
          description="You're in all-units mode. Use the unit switcher in the navbar to choose a unit and track daily consumption."
        />
      </section>
    );
  }

  const { date: dateParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '')
    ? (dateParam as string)
    : today();

  const unitId = user.activeUnitId;

  const { attendanceStatus, presentCount, items } =
    await getDailyRationConsumption(unitId, date);

  const canWrite =
    userHasCapability(user, 'ration.issue', unitId) ||
    userHasCapability(user, 'ration.adjust', unitId);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Daily Consumption
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and commit daily unit ration consumption based on dining strength.
          </p>
        </div>
        <DateSelector date={date} />
      </header>

      <ConsumptionForm
        unitId={unitId}
        date={date}
        attendanceStatus={attendanceStatus}
        presentCount={presentCount}
        initialItems={items}
        canWrite={canWrite}
      />
    </section>
  );
}
