import { getBookings } from "@/lib/guest-rooms/queries";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { BookingsList } from "./bookings-list";
import { ErrorState } from "@/components/shared/error-state";

export async function BookingsTable({
  unitId,
}: {
  unitId: string;
}) {
  const now = new Date();
  const from = format(startOfMonth(now), 'yyyy-MM-dd');
  const to = format(endOfMonth(now), 'yyyy-MM-dd');

  let bookings;
  try {
    bookings = await getBookings(unitId, from, to);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <ErrorState
        title="Could not load bookings"
        description={message}
        className="min-h-48"
      />
    );
  }

  return (
    <BookingsList bookings={bookings} unitId={unitId} />
  );
}
