export type ModalStyle = 'dialog' | 'sheet';

export type UiPreferences = {
  modal_style: ModalStyle;
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  modal_style: 'dialog',
};
