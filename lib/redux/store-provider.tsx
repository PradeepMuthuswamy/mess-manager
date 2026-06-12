'use client';

import { useEffect, useState } from 'react';
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
  // Build the store once and seed it in the initializer so the very first
  // client render already has the user (no hydration flash). The previous
  // version instead diffed the server `user` against the stored copy with
  // JSON.stringify *in the render body* and dispatched on mismatch — a render-
  // time side effect re-run on every render that risks an update loop if the
  // two ever stop round-tripping (e.g. once a client reducer mutates the
  // stored user).
  const [store] = useState(() => {
    const s = makeStore();
    s.dispatch(setAuthUser(user));
    return s;
  });

  // Re-sync only when the server hands us a new `user` (route change / refresh
  // produces a fresh object; ordinary client re-renders keep the same
  // reference, so this effect no-ops). Idempotent and reference-compared — no
  // loop, no render-time work.
  useEffect(() => {
    store.dispatch(setAuthUser(user));
  }, [store, user]);

  return <Provider store={store}>{children}</Provider>;
}
