'use client';

import React from 'react';
import type { AuthUser } from './types';
import StoreProvider from '../redux/store-provider';
import { useAppSelector } from '../redux/hooks';

export function AppContextProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: AuthUser;
}) {
  return (
    <StoreProvider user={user}>
      {children}
    </StoreProvider>
  );
}

export function useAppContext() {
  const user = useAppSelector((state) => state.auth.user);
  if (!user) {
    throw new Error('useAppContext must be used within an AppContextProvider wrapped in StoreProvider');
  }
  return {
    user,
    activeUnitId: user.activeUnitId,
    isAllUnits: user.isAllUnits,
  };
}
