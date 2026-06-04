'use client';

import { createContext, useContext } from 'react';
import type { ModalStyle } from './types';
import { DEFAULT_UI_PREFERENCES } from './types';

const ModalStyleContext = createContext<ModalStyle>(
  DEFAULT_UI_PREFERENCES.modal_style,
);

export function ModalStyleProvider({
  value,
  children,
}: {
  value: ModalStyle;
  children: React.ReactNode;
}) {
  return (
    <ModalStyleContext.Provider value={value}>
      {children}
    </ModalStyleContext.Provider>
  );
}

/** Resolve the user's saved modal-style preference. Defaults to the global
 *  default outside a provider so a stray caller never crashes. */
export function useModalStyle(): ModalStyle {
  return useContext(ModalStyleContext);
}
