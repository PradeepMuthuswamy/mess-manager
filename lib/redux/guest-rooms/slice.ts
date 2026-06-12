import {
  createEntityAdapter,
  createSelector,
  createSlice,
  type EntityState,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type {
  Booking,
  BookingWithBill,
  Room,
  RoomFurniture,
  UnitFurniture,
} from '@/lib/guest-rooms/types';
import type { RootState } from '@/lib/redux/store';

export type GuestRoomsTab = 'calendar' | 'bookings' | 'rooms';
export type GuestRoomsDialog =
  | 'booking-details'
  | 'booking-form'
  | 'bill'
  | 'room-form'
  | null;

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

type RequestState = {
  status: RequestStatus;
  error: string | null;
  fetchedAt: string | null;
};

type BookingDraft = Partial<Booking> | null;

type GuestRoomsUiState = {
  activeTab: GuestRoomsTab;
  calendarMonth: string;
  bookingSearch: string;
  roomSearch: string;
  selectedBookingId: string | null;
  formBooking: BookingDraft;
  billBookingId: string | null;
  selectedRoomId: string | null;
  dialog: GuestRoomsDialog;
  lastUpdatedAt: string | null;
};

export type GuestRoomsSnapshot = {
  unitId: string;
  range: {
    from: string;
    to: string;
  };
  rooms: Room[];
  bookings: Booking[];
  furniture: UnitFurniture[];
  fetchedAt: string;
};

type GuestRoomsState = {
  rooms: EntityState<Room, string>;
  bookings: EntityState<Booking, string>;
  furniture: EntityState<UnitFurniture, string>;
  bookingDetailsById: Record<string, BookingWithBill | undefined>;
  roomInventoryByRoomId: Record<string, RoomFurniture[] | undefined>;
  availabilityByKey: Record<string, Room[] | undefined>;
  requests: Record<string, RequestState | undefined>;
  loadedBookingRanges: Record<string, true | undefined>;
  pendingActions: Record<string, true | undefined>;
  ui: GuestRoomsUiState;
};

const roomsAdapter = createEntityAdapter<Room>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

const bookingsAdapter = createEntityAdapter<Booking>({
  sortComparer: (a, b) =>
    a.check_in_date.localeCompare(b.check_in_date) ||
    a.guest_name.localeCompare(b.guest_name),
});

const furnitureAdapter = createEntityAdapter<UnitFurniture>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

function todayMonth() {
  return new Date().toISOString().slice(0, 7) + '-01';
}

function nowIso() {
  return new Date().toISOString();
}

function requestDone(): RequestState {
  return {
    status: 'succeeded',
    error: null,
    fetchedAt: nowIso(),
  };
}

const initialState: GuestRoomsState = {
  rooms: roomsAdapter.getInitialState(),
  bookings: bookingsAdapter.getInitialState(),
  furniture: furnitureAdapter.getInitialState(),
  bookingDetailsById: {},
  roomInventoryByRoomId: {},
  availabilityByKey: {},
  requests: {},
  loadedBookingRanges: {},
  pendingActions: {},
  ui: {
    activeTab: 'calendar',
    calendarMonth: todayMonth(),
    bookingSearch: '',
    roomSearch: '',
    selectedBookingId: null,
    formBooking: null,
    billBookingId: null,
    selectedRoomId: null,
    dialog: null,
    lastUpdatedAt: null,
  },
};

export function bookingsRangeKey(unitId: string, from: string, to: string) {
  return `bookings:${unitId}:${from}:${to}`;
}

export function roomsKey(unitId: string) {
  return `rooms:${unitId}`;
}

export function furnitureKey(unitId: string) {
  return `furniture:${unitId}`;
}

export function bookingDetailKey(bookingId: string) {
  return `booking-detail:${bookingId}`;
}

export function roomInventoryKey(roomId: string) {
  return `room-inventory:${roomId}`;
}

export function availabilityKey(unitId: string, checkIn: string, checkOut: string) {
  return `availability:${unitId}:${checkIn}:${checkOut}`;
}

export function bookingActionKey(action: string, bookingId: string) {
  return `booking:${action}:${bookingId}`;
}

export const guestRoomsSlice = createSlice({
  name: 'guestRooms',
  initialState,
  reducers: {
    hydrateGuestRoomsSnapshot: (
      state,
      action: PayloadAction<GuestRoomsSnapshot>,
    ) => {
      const { unitId, range, rooms, bookings, furniture, fetchedAt } =
        action.payload;
      roomsAdapter.setAll(state.rooms, rooms);
      bookingsAdapter.setAll(state.bookings, bookings);
      furnitureAdapter.setAll(state.furniture, furniture);

      const rangeKey = bookingsRangeKey(unitId, range.from, range.to);
      state.loadedBookingRanges[rangeKey] = true;
      state.requests[rangeKey] = {
        status: 'succeeded',
        error: null,
        fetchedAt,
      };
      state.requests[roomsKey(unitId)] = {
        status: 'succeeded',
        error: null,
        fetchedAt,
      };
      state.requests[furnitureKey(unitId)] = {
        status: 'succeeded',
        error: null,
        fetchedAt,
      };
      state.ui.lastUpdatedAt = fetchedAt;
    },
    setGuestRoomsTab: (state, action: PayloadAction<GuestRoomsTab>) => {
      state.ui.activeTab = action.payload;
    },
    setCalendarMonth: (state, action: PayloadAction<string>) => {
      state.ui.calendarMonth = action.payload;
    },
    setBookingSearch: (state, action: PayloadAction<string>) => {
      state.ui.bookingSearch = action.payload;
    },
    setRoomSearch: (state, action: PayloadAction<string>) => {
      state.ui.roomSearch = action.payload;
    },
    openBookingDetails: (state, action: PayloadAction<string>) => {
      state.ui.selectedBookingId = action.payload;
      state.ui.dialog = 'booking-details';
    },
    closeBookingDetails: (state) => {
      if (state.ui.dialog === 'booking-details') state.ui.dialog = null;
      state.ui.selectedBookingId = null;
    },
    openBookingForm: (state, action: PayloadAction<BookingDraft>) => {
      state.ui.formBooking = action.payload;
      state.ui.dialog = 'booking-form';
      state.ui.selectedBookingId = null;
    },
    closeBookingForm: (state) => {
      if (state.ui.dialog === 'booking-form') state.ui.dialog = null;
      state.ui.formBooking = null;
    },
    openBillDialog: (state, action: PayloadAction<string>) => {
      state.ui.billBookingId = action.payload;
      state.ui.dialog = 'bill';
    },
    closeBillDialog: (state) => {
      if (state.ui.dialog === 'bill') state.ui.dialog = null;
      state.ui.billBookingId = null;
    },
    openRoomForm: (state, action: PayloadAction<string | null>) => {
      state.ui.selectedRoomId = action.payload;
      state.ui.dialog = 'room-form';
    },
    closeRoomForm: (state) => {
      if (state.ui.dialog === 'room-form') state.ui.dialog = null;
      state.ui.selectedRoomId = null;
    },
    requestStarted: (state, action: PayloadAction<string>) => {
      state.requests[action.payload] = {
        status: 'loading',
        error: null,
        fetchedAt: state.requests[action.payload]?.fetchedAt ?? null,
      };
    },
    requestSucceeded: (state, action: PayloadAction<string>) => {
      state.requests[action.payload] = requestDone();
      state.ui.lastUpdatedAt = state.requests[action.payload]?.fetchedAt ?? nowIso();
    },
    requestFailed: (
      state,
      action: PayloadAction<{ key: string; error: string }>,
    ) => {
      state.requests[action.payload.key] = {
        status: 'failed',
        error: action.payload.error,
        fetchedAt: state.requests[action.payload.key]?.fetchedAt ?? null,
      };
    },
    pendingActionStarted: (state, action: PayloadAction<string>) => {
      state.pendingActions[action.payload] = true;
    },
    pendingActionFinished: (state, action: PayloadAction<string>) => {
      delete state.pendingActions[action.payload];
    },
    bookingsRangeLoaded: (
      state,
      action: PayloadAction<{
        unitId: string;
        from: string;
        to: string;
        bookings: Booking[];
      }>,
    ) => {
      const incomingIds = new Set(
        action.payload.bookings.map((booking) => booking.id),
      );
      const staleIds = Object.values(state.bookings.entities)
        .filter(
          (booking): booking is Booking =>
            !!booking &&
            booking.check_out_date >= action.payload.from &&
            booking.check_in_date <= action.payload.to &&
            !incomingIds.has(booking.id),
        )
        .map((booking) => booking.id);

      bookingsAdapter.removeMany(state.bookings, staleIds);
      bookingsAdapter.upsertMany(state.bookings, action.payload.bookings);
      state.loadedBookingRanges[
        bookingsRangeKey(action.payload.unitId, action.payload.from, action.payload.to)
      ] = true;
    },
    roomsLoaded: (state, action: PayloadAction<Room[]>) => {
      roomsAdapter.setAll(state.rooms, action.payload);
    },
    roomRowsLoaded: (state, action: PayloadAction<Room[]>) => {
      roomsAdapter.upsertMany(state.rooms, action.payload);
    },
    furnitureLoaded: (state, action: PayloadAction<UnitFurniture[]>) => {
      furnitureAdapter.setAll(state.furniture, action.payload);
    },
    furnitureUpserted: (state, action: PayloadAction<UnitFurniture>) => {
      furnitureAdapter.upsertOne(state.furniture, action.payload);
    },
    bookingUpserted: (state, action: PayloadAction<Booking>) => {
      bookingsAdapter.upsertOne(state.bookings, action.payload);
      state.bookingDetailsById[action.payload.id] = undefined;
    },
    bookingRemoved: (state, action: PayloadAction<string>) => {
      bookingsAdapter.removeOne(state.bookings, action.payload);
      delete state.bookingDetailsById[action.payload];
      if (state.ui.selectedBookingId === action.payload) {
        state.ui.selectedBookingId = null;
      }
      if (state.ui.billBookingId === action.payload) {
        state.ui.billBookingId = null;
      }
    },
    roomUpserted: (state, action: PayloadAction<Room>) => {
      roomsAdapter.upsertOne(state.rooms, action.payload);
    },
    bookingDetailLoaded: (state, action: PayloadAction<BookingWithBill>) => {
      state.bookingDetailsById[action.payload.id] = action.payload;
      bookingsAdapter.upsertOne(state.bookings, action.payload);
    },
    roomInventoryLoaded: (
      state,
      action: PayloadAction<{ roomId: string; inventory: RoomFurniture[] }>,
    ) => {
      state.roomInventoryByRoomId[action.payload.roomId] =
        action.payload.inventory;
    },
    availabilityLoaded: (
      state,
      action: PayloadAction<{ key: string; rooms: Room[] }>,
    ) => {
      state.availabilityByKey[action.payload.key] = action.payload.rooms;
    },
  },
});

export const {
  availabilityLoaded,
  bookingDetailLoaded,
  bookingRemoved,
  bookingUpserted,
  bookingsRangeLoaded,
  closeBillDialog,
  closeBookingDetails,
  closeBookingForm,
  closeRoomForm,
  furnitureLoaded,
  furnitureUpserted,
  hydrateGuestRoomsSnapshot,
  openBillDialog,
  openBookingDetails,
  openBookingForm,
  openRoomForm,
  pendingActionFinished,
  pendingActionStarted,
  requestFailed,
  requestStarted,
  requestSucceeded,
  roomInventoryLoaded,
  roomRowsLoaded,
  roomsLoaded,
  roomUpserted,
  setBookingSearch,
  setCalendarMonth,
  setGuestRoomsTab,
  setRoomSearch,
} = guestRoomsSlice.actions;

export default guestRoomsSlice.reducer;

const selectGuestRooms = (state: RootState) => state.guestRooms;

export const roomSelectors = roomsAdapter.getSelectors<RootState>(
  (state) => state.guestRooms.rooms,
);

export const bookingSelectors = bookingsAdapter.getSelectors<RootState>(
  (state) => state.guestRooms.bookings,
);

export const furnitureSelectors = furnitureAdapter.getSelectors<RootState>(
  (state) => state.guestRooms.furniture,
);

export const selectGuestRoomsUi = createSelector(
  selectGuestRooms,
  (state) => state.ui,
);

export const selectGuestRoomsRequest = (state: RootState, key: string) =>
  state.guestRooms.requests[key] ?? {
    status: 'idle',
    error: null,
    fetchedAt: null,
  };

export const selectIsRequestLoading = (state: RootState, key: string) =>
  selectGuestRoomsRequest(state, key).status === 'loading';

export const selectIsBookingRangeLoaded = (state: RootState, key: string) =>
  state.guestRooms.loadedBookingRanges[key] === true;

export const selectIsActionPending = (state: RootState, key: string) =>
  state.guestRooms.pendingActions[key] === true;

export const selectPendingActions = (state: RootState) =>
  state.guestRooms.pendingActions;

export const selectBookingDetail = (state: RootState, bookingId: string | null) =>
  bookingId ? state.guestRooms.bookingDetailsById[bookingId] ?? null : null;

export const selectRoomInventory = (state: RootState, roomId: string | null) =>
  roomId ? state.guestRooms.roomInventoryByRoomId[roomId] ?? null : null;

export const selectAvailability = (
  state: RootState,
  unitId: string,
  checkIn: string,
  checkOut: string,
) => state.guestRooms.availabilityByKey[availabilityKey(unitId, checkIn, checkOut)] ?? [];

export const selectVisibleBookings = createSelector(
  [
    bookingSelectors.selectAll,
    (_state: RootState, from: string) => from,
    (_state: RootState, _from: string, to: string) => to,
  ],
  (bookings, from, to) =>
    bookings.filter(
      (booking) =>
        booking.check_out_date >= from && booking.check_in_date <= to,
    ),
);

export const selectFilteredBookings = createSelector(
  [bookingSelectors.selectAll, selectGuestRoomsUi],
  (bookings, ui) => {
    const query = ui.bookingSearch.toLowerCase().trim();
    if (!query) return bookings;
    return bookings.filter((booking) => {
      return [
        booking.guest_name,
        booking.guest_rank,
        booking.guest_phone,
        booking.guest_email,
        booking.room?.name,
        booking.status.replace('_', ' '),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  },
);

export const selectFilteredRooms = createSelector(
  [roomSelectors.selectAll, selectGuestRoomsUi],
  (rooms, ui) => {
    const query = ui.roomSearch.toLowerCase().trim();
    if (!query) return rooms;
    return rooms.filter((room) =>
      [room.name, room.room_type, room.current_status, room.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  },
);

function dateBetween(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export const selectGuestRoomsSummary = createSelector(
  [roomSelectors.selectAll, bookingSelectors.selectAll],
  (rooms, bookings) => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      totalRooms: rooms.length,
      vacant: rooms.filter((room) => room.current_status === 'vacant').length,
      reserved: rooms.filter((room) => room.current_status === 'reserved').length,
      occupied: rooms.filter((room) => room.current_status === 'occupied').length,
      arrivalsToday: bookings.filter(
        (booking) =>
          booking.status !== 'cancelled' && booking.check_in_date === today,
      ).length,
      departuresToday: bookings.filter(
        (booking) =>
          booking.status !== 'cancelled' && booking.check_out_date === today,
      ).length,
    };
  },
);

export const selectTodayWorklist = createSelector(
  [bookingSelectors.selectAll],
  (bookings) => {
    const today = new Date().toISOString().slice(0, 10);
    const active = bookings.filter((booking) => booking.status !== 'cancelled');
    return {
      arrivals: active.filter((booking) => booking.check_in_date === today),
      departures: active.filter((booking) => booking.check_out_date === today),
      inHouse: active.filter((booking) =>
        dateBetween(today, booking.check_in_date, booking.check_out_date),
      ),
    };
  },
);
