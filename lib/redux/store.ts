import { configureStore, type Action, type ThunkAction } from '@reduxjs/toolkit';
import authReducer from './auth-slice';
import { guestRoomsReducer } from './guest-rooms';

export const makeStore = () => {
  return configureStore({
    reducer: {
      auth: authReducer,
      guestRooms: guestRoomsReducer,
    },
  });
};

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  undefined,
  Action
>;
