import Link from 'next/link';
import { requireCapability } from '@/lib/auth/require-capability';
import { userHasCapability } from '@/lib/auth/capabilities';
import {
  getAttendanceDay,
  getMonthlyAttendance,
  listDiningCandidates,
} from '@/lib/attendance/queries';
import { AttendanceRoster } from './_components/attendance-roster';
import { AttendanceCalendar } from './_components/attendance-calendar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { CalendarX } from 'lucide-react';

export const dynamic = 'force-dynamic';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; month?: string }>;
}) {
  const user = await requireCapability('attendance.read');
  const unitId = user.activeUnitId ?? user.homeUnitId;

  const { date: dateParam, view, month: monthParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '')
    ? (dateParam as string)
    : today();
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? '')
    ? (monthParam as string)
    : date.slice(0, 7);
  const isCalendar = view === 'calendar';

  if (!unitId) {
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Attendance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily dining-in roll for the unit.
          </p>
        </div>
        <EmptyState
          icon={<CalendarX className="size-5" />}
          title="No active unit"
          description="Pick a unit before recording attendance."
        />
      </div>
    );
  }

  let body: React.ReactNode;
  if (isCalendar) {
    body = (
      <AttendanceCalendar data={await getMonthlyAttendance(unitId, month)} />
    );
  } else {
    const [dayView, candidates] = await Promise.all([
      getAttendanceDay(unitId, date),
      listDiningCandidates(unitId),
    ]);
    body = (
      <AttendanceRoster
        unitId={unitId}
        date={date}
        view={dayView}
        candidates={candidates}
        canFinalize={userHasCapability(user, 'attendance.finalize', unitId)}
      />
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Attendance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily dining-in roll for the unit. Everyone is present by default;
            mark the absentees.
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button asChild size="sm" variant={isCalendar ? 'outline' : 'default'}>
            <Link href={`/attendance?date=${date}`}>Day</Link>
          </Button>
          <Button asChild size="sm" variant={isCalendar ? 'default' : 'outline'}>
            <Link href={`/attendance?view=calendar&month=${month}`}>
              Calendar
            </Link>
          </Button>
        </div>
      </div>
      {body}
    </div>
  );
}
