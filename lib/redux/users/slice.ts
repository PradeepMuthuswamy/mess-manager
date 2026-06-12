import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Role, Capability } from '@/lib/auth/types';
import type { RootState } from '../store';

export type UserFormFields = {
  email: string;
  fullName: string;
  rank: string;
  serviceNo: string;
  role: Role;
  unitId: string | null;
  selectedCapabilities: Capability[];
  selectedTemplateId: string;
};

export type UsersUiState = {
  isFormOpen: boolean;
  isEditing: boolean;
  editingUser: any | null;
  form: UserFormFields;
  error: string | null;
};

type UsersState = {
  ui: UsersUiState;
};

const defaultForm: UserFormFields = {
  email: '',
  fullName: '',
  rank: '',
  serviceNo: '',
  role: 'user',
  unitId: null,
  selectedCapabilities: [],
  selectedTemplateId: '',
};

const initialState: UsersState = {
  ui: {
    isFormOpen: false,
    isEditing: false,
    editingUser: null,
    form: defaultForm,
    error: null,
  },
};

export const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    openInvite: (state, action: PayloadAction<{ activeUnitId: string | null }>) => {
      state.ui.isFormOpen = true;
      state.ui.isEditing = false;
      state.ui.editingUser = null;
      state.ui.error = null;
      state.ui.form = {
        ...defaultForm,
        unitId: action.payload.activeUnitId,
      };
    },
    openEdit: (state, action: PayloadAction<{ user: any }>) => {
      const { user } = action.payload;
      state.ui.isFormOpen = true;
      state.ui.isEditing = true;
      state.ui.editingUser = user;
      state.ui.error = null;
      state.ui.form = {
        email: user.email || '',
        fullName: user.full_name || '',
        rank: user.rank || '',
        serviceNo: user.service_no || '',
        role: user.role as Role,
        unitId: user.unit_id,
        selectedCapabilities: (user.user_capabilities || []).map((uc: any) => uc.capability as Capability),
        selectedTemplateId: '',
      };
    },
    closeForm: (state) => {
      state.ui.isFormOpen = false;
      state.ui.isEditing = false;
      state.ui.editingUser = null;
      state.ui.error = null;
      state.ui.form = defaultForm;
    },
    updateFormField: <K extends keyof UserFormFields>(
      state: UsersState,
      action: PayloadAction<{ field: K; value: UserFormFields[K] }>
    ) => {
      state.ui.form[action.payload.field] = action.payload.value;
    },
    toggleCapability: (state, action: PayloadAction<{ capability: Capability; checked: boolean }>) => {
      const { capability, checked } = action.payload;
      state.ui.form.selectedTemplateId = '';
      if (checked) {
        if (!state.ui.form.selectedCapabilities.includes(capability)) {
          state.ui.form.selectedCapabilities.push(capability);
        }
      } else {
        state.ui.form.selectedCapabilities = state.ui.form.selectedCapabilities.filter(
          (c) => c !== capability
        );
      }
    },
    toggleAssignment: (
      state,
      action: PayloadAction<{ key: string; checked: boolean; capabilities: readonly string[] }>
    ) => {
      const { key, checked, capabilities } = action.payload;
      state.ui.form.selectedTemplateId = '';
      
      let nextCaps = [...state.ui.form.selectedCapabilities];
      if (checked) {
        capabilities.forEach((c) => {
          if (!nextCaps.includes(c as Capability)) nextCaps.push(c as Capability);
        });
        if (key === 'mess_secretary') {
          state.ui.form.role = 'mess_secretary';
        }
      } else {
        nextCaps = nextCaps.filter((c) => !capabilities.includes(c));
        if (key === 'mess_secretary' && state.ui.form.role === 'mess_secretary') {
          state.ui.form.role = 'user';
        }
      }
      state.ui.form.selectedCapabilities = nextCaps;
    },
    toggleDomain: (state, action: PayloadAction<{ domainCaps: Capability[]; checked: boolean }>) => {
      const { domainCaps, checked } = action.payload;
      state.ui.form.selectedTemplateId = '';
      const filtered = state.ui.form.selectedCapabilities.filter(
        (c) => !domainCaps.includes(c)
      );
      if (checked) {
        state.ui.form.selectedCapabilities = [...filtered, ...domainCaps];
      } else {
        state.ui.form.selectedCapabilities = filtered;
      }
    },
    changeRole: (
      state,
      action: PayloadAction<{ role: Role; messSecretaryCapabilities: readonly string[] }>
    ) => {
      const { role, messSecretaryCapabilities } = action.payload;
      state.ui.form.role = role;
      
      let nextCaps = [...state.ui.form.selectedCapabilities];
      if (role === 'mess_secretary') {
        messSecretaryCapabilities.forEach((c) => {
          if (!nextCaps.includes(c as Capability)) nextCaps.push(c as Capability);
        });
      } else {
        nextCaps = nextCaps.filter((c) => !messSecretaryCapabilities.includes(c));
      }
      state.ui.form.selectedCapabilities = nextCaps;
    },
    applyTemplate: (state, action: PayloadAction<{ templateId: string; capabilities: Capability[] }>) => {
      state.ui.form.selectedTemplateId = action.payload.templateId;
      state.ui.form.selectedCapabilities = action.payload.capabilities;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.ui.error = action.payload;
    },
  },
});

export const {
  openInvite,
  openEdit,
  closeForm,
  updateFormField,
  toggleCapability,
  toggleAssignment,
  toggleDomain,
  changeRole,
  applyTemplate,
  setError,
} = usersSlice.actions;

export const selectUsersUi = (state: RootState) => state.users.ui;

export default usersSlice.reducer;
