import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { InventoryLotRow } from '@/lib/stock/types';
import type { RootState } from '../store';

export type StockUiState = {
  isAddOpen: boolean;
  isEditOpen: boolean;
  isAddMasterOpen: boolean;
  selectedItemId: string | null;
  selectedLot: InventoryLotRow | null;
};

type StockState = {
  ui: StockUiState;
};

const initialState: StockState = {
  ui: {
    isAddOpen: false,
    isEditOpen: false,
    isAddMasterOpen: false,
    selectedItemId: null,
    selectedLot: null,
  },
};

export const stockSlice = createSlice({
  name: 'stock',
  initialState,
  reducers: {
    openAddDialog: (
      state,
      action: PayloadAction<{ itemId?: string } | undefined>,
    ) => {
      state.ui.isAddOpen = true;
      state.ui.selectedItemId = action.payload?.itemId ?? null;
    },
    closeAddDialog: (state) => {
      state.ui.isAddOpen = false;
      state.ui.selectedItemId = null;
    },
    openEditDialog: (state, action: PayloadAction<InventoryLotRow>) => {
      state.ui.isEditOpen = true;
      state.ui.selectedLot = action.payload;
    },
    closeEditDialog: (state) => {
      state.ui.isEditOpen = false;
      state.ui.selectedLot = null;
    },
    openAddMasterDialog: (state) => {
      state.ui.isAddMasterOpen = true;
    },
    closeAddMasterDialog: (state) => {
      state.ui.isAddMasterOpen = false;
    },
  },
});

export const {
  openAddDialog,
  closeAddDialog,
  openEditDialog,
  closeEditDialog,
  openAddMasterDialog,
  closeAddMasterDialog,
} = stockSlice.actions;

// Selectors
export const selectStockUi = (state: RootState) => state.stock.ui;

export default stockSlice.reducer;
