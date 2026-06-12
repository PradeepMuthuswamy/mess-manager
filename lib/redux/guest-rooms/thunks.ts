import {
  availabilityKey,
  availabilityLoaded,
  bookingActionKey,
  bookingDetailKey,
  bookingDetailLoaded,
  bookingRemoved,
  bookingUpserted,
  bookingsRangeKey,
  bookingsRangeLoaded,
  furnitureKey,
  furnitureLoaded,
  furnitureUpserted,
  pendingActionFinished,
  pendingActionStarted,
  requestFailed,
  requestStarted,
  requestSucceeded,
  roomInventoryKey,
  roomInventoryLoaded,
  roomRowsLoaded,
  roomUpserted,
  roomsKey,
  roomsLoaded,
  selectIsBookingRangeLoaded,
  selectVisibleBookings,
} from './slice';
import type {
  Booking,
  BookingWithBill,
  Room,
  RoomFurniture,
  UnitFurniture,
} from '@/lib/guest-rooms/types';
import type {
  CreateBookingInput,
  CreateFurnitureItemInput,
  CreateRoomInput,
  UpdateBookingInput,
  UpdateRoomInput,
} from '@/lib/schemas/guest-rooms';
import {
  cancelBookingAction,
  checkInAction,
  checkOutAction,
  createBookingAction,
  createFurnitureItemAction,
  createRoomAction,
  deleteBookingAction,
  fetchAvailableRoomsAction,
  fetchBookingWithBillAction,
  fetchMonthBookingsAction,
  fetchRoomInventoryAction,
  fetchRoomsAction,
  fetchRoomsByIdsAction,
  fetchUnitFurnitureAction,
  undoCheckInAction,
  undoCheckOutAction,
  updateBookingAction,
  updateRoomAction,
} from '@/lib/guest-rooms/actions';
import type { AppDispatch, AppThunk } from '@/lib/redux/store';

type ActionResult<T> = {
  ok?: boolean;
  error?: string;
  data?: T;
  affectedRoomIds?: string[];
};

type DeleteResult = {
  ok?: boolean;
  error?: string;
  deletedBookingId?: string;
  affectedRoomIds?: string[];
};

function errorFrom(result: { error?: string }) {
  return result.error ?? 'Something went wrong';
}

async function fetchAffectedRooms(
  dispatch: AppDispatch,
  unitId: string,
  roomIds: string[] | undefined,
) {
  const ids = [...new Set(roomIds ?? [])].filter(Boolean);
  if (ids.length === 0) return;

  const result = await fetchRoomsByIdsAction(unitId, ids);
  if (result.data) {
    dispatch(roomRowsLoaded(result.data as Room[]));
  }
}

async function commitBookingMutation<T extends ActionResult<Booking>>(
  dispatch: AppDispatch,
  unitId: string,
  result: T,
) {
  if (result.error || !result.data) {
    throw new Error(errorFrom(result));
  }
  dispatch(bookingUpserted(result.data));
  await fetchAffectedRooms(dispatch, unitId, result.affectedRoomIds);
  return result.data;
}

export function fetchBookingsRange({
  unitId,
  from,
  to,
  force = false,
}: {
  unitId: string;
  from: string;
  to: string;
  force?: boolean;
}): AppThunk<Promise<Booking[]>> {
  return async (dispatch, getState) => {
    const key = bookingsRangeKey(unitId, from, to);
    if (!force && selectIsBookingRangeLoaded(getState(), key)) {
      return selectVisibleBookings(getState(), from, to);
    }

    dispatch(requestStarted(key));
    const result = await fetchMonthBookingsAction(unitId, from, to);
    if (result.error) {
      dispatch(requestFailed({ key, error: result.error }));
      throw new Error(result.error);
    }

    const bookings = (result.data ?? []) as Booking[];
    dispatch(bookingsRangeLoaded({ unitId, from, to, bookings }));
    dispatch(requestSucceeded(key));
    return bookings;
  };
}

export function fetchRooms(unitId: string, force = false): AppThunk<Promise<Room[]>> {
  return async (dispatch, getState) => {
    const key = roomsKey(unitId);
    if (!force && getState().guestRooms.requests[key]?.status === 'succeeded') {
      return Object.values(getState().guestRooms.rooms.entities).filter(Boolean);
    }

    dispatch(requestStarted(key));
    const result = await fetchRoomsAction(unitId);
    if (result.error) {
      dispatch(requestFailed({ key, error: result.error }));
      throw new Error(result.error);
    }

    const rooms = (result.data ?? []) as Room[];
    dispatch(roomsLoaded(rooms));
    dispatch(requestSucceeded(key));
    return rooms;
  };
}

export function fetchFurniture(
  unitId: string,
  force = false,
): AppThunk<Promise<UnitFurniture[]>> {
  return async (dispatch, getState) => {
    const key = furnitureKey(unitId);
    if (!force && getState().guestRooms.requests[key]?.status === 'succeeded') {
      return Object.values(getState().guestRooms.furniture.entities).filter(Boolean);
    }

    dispatch(requestStarted(key));
    const result = await fetchUnitFurnitureAction(unitId);
    if (result.error) {
      dispatch(requestFailed({ key, error: result.error }));
      throw new Error(result.error);
    }

    const furniture = (result.data ?? []) as UnitFurniture[];
    dispatch(furnitureLoaded(furniture));
    dispatch(requestSucceeded(key));
    return furniture;
  };
}

export function fetchAvailableRooms({
  unitId,
  checkIn,
  checkOut,
  force = false,
}: {
  unitId: string;
  checkIn: string;
  checkOut: string;
  force?: boolean;
}): AppThunk<Promise<Room[]>> {
  return async (dispatch, getState) => {
    const key = availabilityKey(unitId, checkIn, checkOut);
    if (!force && getState().guestRooms.requests[key]?.status === 'succeeded') {
      return getState().guestRooms.availabilityByKey[key] ?? [];
    }

    dispatch(requestStarted(key));
    const result = await fetchAvailableRoomsAction(unitId, checkIn, checkOut);
    if (result.error) {
      dispatch(requestFailed({ key, error: result.error }));
      throw new Error(result.error);
    }

    const rooms = (result.data ?? []) as Room[];
    dispatch(availabilityLoaded({ key, rooms }));
    dispatch(requestSucceeded(key));
    return rooms;
  };
}

export function fetchBookingDetail(bookingId: string): AppThunk<Promise<BookingWithBill>> {
  return async (dispatch) => {
    const key = bookingDetailKey(bookingId);
    dispatch(requestStarted(key));
    const result = await fetchBookingWithBillAction(bookingId);
    if (result.error || !result.data) {
      dispatch(requestFailed({ key, error: errorFrom(result) }));
      throw new Error(errorFrom(result));
    }

    const booking = result.data as BookingWithBill;
    dispatch(bookingDetailLoaded(booking));
    dispatch(requestSucceeded(key));
    return booking;
  };
}

export function fetchRoomInventory(roomId: string): AppThunk<Promise<RoomFurniture[]>> {
  return async (dispatch, getState) => {
    const key = roomInventoryKey(roomId);
    if (getState().guestRooms.requests[key]?.status === 'succeeded') {
      return getState().guestRooms.roomInventoryByRoomId[roomId] ?? [];
    }

    dispatch(requestStarted(key));
    const result = await fetchRoomInventoryAction(roomId);
    if (result.error) {
      dispatch(requestFailed({ key, error: result.error }));
      throw new Error(result.error);
    }

    const inventory = (result.data ?? []) as RoomFurniture[];
    dispatch(roomInventoryLoaded({ roomId, inventory }));
    dispatch(requestSucceeded(key));
    return inventory;
  };
}

export function createBooking(input: CreateBookingInput): AppThunk<Promise<Booking>> {
  return async (dispatch) => {
    const key = 'booking:create';
    dispatch(pendingActionStarted(key));
    try {
      const result = await createBookingAction(input);
      const booking = await commitBookingMutation(dispatch, input.unit_id, result);
      dispatch(requestSucceeded(key));
      return booking;
    } catch (error) {
      dispatch(requestFailed({ key, error: error instanceof Error ? error.message : 'Failed to create booking' }));
      throw error;
    } finally {
      dispatch(pendingActionFinished(key));
    }
  };
}

export function updateBooking({
  id,
  input,
  unitId,
}: {
  id: string;
  input: UpdateBookingInput;
  unitId: string;
}): AppThunk<Promise<Booking>> {
  return async (dispatch) => {
    const key = bookingActionKey('update', id);
    dispatch(pendingActionStarted(key));
    try {
      const result = await updateBookingAction(id, input);
      const booking = await commitBookingMutation(dispatch, unitId, result);
      dispatch(requestSucceeded(key));
      return booking;
    } catch (error) {
      dispatch(requestFailed({ key, error: error instanceof Error ? error.message : 'Failed to update booking' }));
      throw error;
    } finally {
      dispatch(pendingActionFinished(key));
    }
  };
}

export function checkInBooking(unitId: string, bookingId: string): AppThunk<Promise<Booking>> {
  return bookingStatusThunk('check-in', unitId, bookingId, checkInAction);
}

export function checkOutBooking(unitId: string, bookingId: string): AppThunk<Promise<Booking>> {
  return bookingStatusThunk('check-out', unitId, bookingId, checkOutAction);
}

export function cancelBooking(unitId: string, bookingId: string): AppThunk<Promise<Booking>> {
  return bookingStatusThunk('cancel', unitId, bookingId, cancelBookingAction);
}

export function undoCheckInBooking(unitId: string, bookingId: string): AppThunk<Promise<Booking>> {
  return bookingStatusThunk('undo-check-in', unitId, bookingId, undoCheckInAction);
}

export function undoCheckOutBooking(unitId: string, bookingId: string): AppThunk<Promise<Booking>> {
  return bookingStatusThunk('undo-check-out', unitId, bookingId, undoCheckOutAction);
}

function bookingStatusThunk(
  action: string,
  unitId: string,
  bookingId: string,
  fn: (bookingId: string) => Promise<ActionResult<Booking>>,
): AppThunk<Promise<Booking>> {
  return async (dispatch) => {
    const key = bookingActionKey(action, bookingId);
    dispatch(pendingActionStarted(key));
    try {
      const result = await fn(bookingId);
      const booking = await commitBookingMutation(dispatch, unitId, result);
      dispatch(requestSucceeded(key));
      return booking;
    } catch (error) {
      dispatch(requestFailed({ key, error: error instanceof Error ? error.message : `Failed to ${action}` }));
      throw error;
    } finally {
      dispatch(pendingActionFinished(key));
    }
  };
}

export function deleteBooking(unitId: string, bookingId: string): AppThunk<Promise<void>> {
  return async (dispatch) => {
    const key = bookingActionKey('delete', bookingId);
    dispatch(pendingActionStarted(key));
    try {
      const result: DeleteResult = await deleteBookingAction(bookingId);
      if (result.error || !result.deletedBookingId) {
        throw new Error(errorFrom(result));
      }
      dispatch(bookingRemoved(result.deletedBookingId));
      await fetchAffectedRooms(dispatch, unitId, result.affectedRoomIds);
      dispatch(requestSucceeded(key));
    } catch (error) {
      dispatch(requestFailed({ key, error: error instanceof Error ? error.message : 'Failed to delete booking' }));
      throw error;
    } finally {
      dispatch(pendingActionFinished(key));
    }
  };
}

export function createRoom(input: CreateRoomInput): AppThunk<Promise<Room>> {
  return async (dispatch) => {
    const key = 'room:create';
    dispatch(pendingActionStarted(key));
    try {
      const result = await createRoomAction(input);
      if ('error' in result) throw new Error(result.error);
      if (!result.data) throw new Error('Failed to create room');
      const room = result.data as Room;
      dispatch(roomUpserted(room));
      dispatch(requestSucceeded(key));
      return room;
    } catch (error) {
      dispatch(requestFailed({ key, error: error instanceof Error ? error.message : 'Failed to create room' }));
      throw error;
    } finally {
      dispatch(pendingActionFinished(key));
    }
  };
}

export function updateRoom({
  id,
  input,
}: {
  id: string;
  input: UpdateRoomInput;
}): AppThunk<Promise<Room>> {
  return async (dispatch) => {
    const key = `room:update:${id}`;
    dispatch(pendingActionStarted(key));
    try {
      const result = await updateRoomAction(id, input);
      if ('error' in result) throw new Error(result.error);
      if (!result.data) throw new Error('Failed to update room');
      const room = result.data as Room;
      dispatch(roomUpserted(room));
      dispatch(requestSucceeded(key));
      return room;
    } catch (error) {
      dispatch(requestFailed({ key, error: error instanceof Error ? error.message : 'Failed to update room' }));
      throw error;
    } finally {
      dispatch(pendingActionFinished(key));
    }
  };
}

export function createFurnitureItem(
  input: CreateFurnitureItemInput,
): AppThunk<Promise<UnitFurniture>> {
  return async (dispatch) => {
    const key = 'furniture:create';
    dispatch(pendingActionStarted(key));
    try {
      const result = await createFurnitureItemAction(input);
      if (result.error || !result.data) throw new Error(errorFrom(result));
      const furniture = result.data as UnitFurniture;
      dispatch(furnitureUpserted(furniture));
      dispatch(requestSucceeded(key));
      return furniture;
    } catch (error) {
      dispatch(requestFailed({ key, error: error instanceof Error ? error.message : 'Failed to add furniture' }));
      throw error;
    } finally {
      dispatch(pendingActionFinished(key));
    }
  };
}
