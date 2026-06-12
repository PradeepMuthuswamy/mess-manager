'use client';

import { useState } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from './store';
import { setAuthUser } from './auth-slice';
import type { AuthUser } from '../auth/types';

export default function StoreProvider({
  user,
  children,
}: {
  user: AuthUser | null;
  children: React.ReactNode;
}) {
  const [store] = useState(() => {
    const s = makeStore();
    if (user) {
      s.dispatch(setAuthUser(user));
    }
    return s;
  });

  const currentUser = store.getState().auth.user;
  if (JSON.stringify(currentUser) !== JSON.stringify(user)) {
    store.dispatch(setAuthUser(user));
  }

  return <Provider store={store}>{children}</Provider>;
}
