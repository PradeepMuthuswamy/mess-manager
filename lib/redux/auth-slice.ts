import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../auth/types';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  isLoading: false,
  error: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthUser: (state, action: PayloadAction<AuthUser | null>) => {
      state.user = action.payload;
    },
    setActiveUnit: (state, action: PayloadAction<string | null>) => {
      if (state.user) {
        state.user.activeUnitId = action.payload;
        state.user.isAllUnits = action.payload === null || action.payload === 'all';
      }
    },
  },
});

export const { setAuthUser, setActiveUnit } = authSlice.actions;
export default authSlice.reducer;
