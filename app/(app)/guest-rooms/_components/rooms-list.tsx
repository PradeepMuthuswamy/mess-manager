import { getRooms, getUnitFurniture } from "@/lib/guest-rooms/queries";
import { RoomsTable } from "./rooms-table";
import { ErrorState } from "@/components/shared/error-state";

export async function RoomsList({
  unitId,
}: {
  unitId: string;
}) {
  let rooms;
  let furnitureCatalogue;

  try {
    [rooms, furnitureCatalogue] = await Promise.all([
      getRooms(unitId),
      getUnitFurniture(unitId),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <ErrorState
        title="Could not load rooms"
        description={message}
        className="min-h-48"
      />
    );
  }

  return (
    <RoomsTable
      rooms={rooms}
      unitId={unitId}
      furnitureCatalogue={furnitureCatalogue}
    />
  );
}
