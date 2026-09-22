import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/capabilities';
import { listUnitMembers } from '@/lib/bar/queries';
import { getCalendarPublish, listCalendarEvents } from '@/lib/calendar/queries';
import { CalendarMonth } from './_components/calendar-month';
import { EventForm } from './_components/event-form';
import { GenerateRecurringButton } from './_components/generate-recurring-button';
import { ImportDialog } from './_components/import-dialog';
import { PublishButton } from './_components/publish-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { CalendarDays } from 'lucide-react';
import { endOfMonth, format, startOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

function parseMonthYear(monthParam?: string, yearParam?: string) {
  const now = new Date();
  const year = Number.parseInt(yearParam ?? '', 10);
  const month = Number.parseInt(monthParam ?? '', 10);
  const safeYear = Number.isInteger(year) && year >= 2020 && year <= 2100
    ? year
    : now.getFullYear();
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12
    ? month
    : now.getMonth() + 1;
  return { year: safeYear, month: safeMonth };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await requireUser();
  const unitId = user.activeUnitId ?? user.homeUnitId;
  const { month: monthParam, year: yearParam } = await searchParams;
  const { year, month } = parseMonthYear(monthParam, yearParam);
  const cursor = new Date(year, month - 1, 1);
  const from = format(startOfMonth(cursor), 'yyyy-MM-dd');
  const to = format(endOfMonth(cursor), 'yyyy-MM-dd');

  const canWrite =
    !!unitId &&
    (user.role === 'mess_secretary' ||
      user.role === 'unit_admin' ||
      userHasCapability(user, 'parties.write', unitId));

  if (!unitId) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" />}
        title="No active unit"
        description="Assign a unit to see the social calendar."
      />
    );
  }

  const [events, publish, members] = await Promise.all([
    listCalendarEvents(unitId, from, to).catch(() => []),
    getCalendarPublish(unitId, year, month).catch(() => null),
    canWrite ? listUnitMembers(unitId).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Social</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Anniversaries, birthdays, formal nights, and mess socials.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {publish ? (
            <Badge variant="success" className="font-mono text-[10px]">
              Published {format(new Date(publish.published_at), 'dd MMM')}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-[10px]">
              Draft
            </Badge>
          )}
          {canWrite ? (
            <>
              <ImportDialog unitId={unitId} />
              <GenerateRecurringButton unitId={unitId} year={year} />
              <PublishButton unitId={unitId} year={year} month={month} published={publish} />
            </>
          ) : null}
        </div>
      </div>

      <CalendarMonth year={year} month={month} events={events} />

      {canWrite ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-heading text-base">Add an event</CardTitle>
            <CardDescription>
              Birthdays, anniversaries, and hosted nights. Duplicates on the same date, member, and type are rejected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventForm
              unitId={unitId}
              members={(members ?? []).map((member) => ({
                id: member.id,
                name: member.full_name ?? member.email ?? 'Member',
                email: member.email,
                service_no: member.service_no,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
