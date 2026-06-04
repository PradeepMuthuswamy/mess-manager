'use client';

import { useEffect, useRef } from 'react';

type ActionLike = { ok?: boolean; error?: string } | null | undefined;

/**
 * Runs onOk / onError exactly once per server-action result.
 *
 * The naive `useEffect(() => { if (state?.ok) ... }, [state, cb])` pattern
 * re-fires whenever an unstable callback (e.g. an inline `onClose`) changes
 * identity while `state.ok` stays truthy — spawning duplicate toasts on any
 * re-render. This keys off the state object identity instead, and reads the
 * handlers through a ref so their identity is irrelevant.
 */
export function useActionResult<S extends ActionLike>(
  state: S,
  handlers: { onOk?: () => void; onError?: (message: string) => void },
): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const handledRef = useRef<S | null>(null);
  useEffect(() => {
    if (!state || state === handledRef.current) return;
    handledRef.current = state;
    if (state.ok) handlersRef.current.onOk?.();
    else if (state.error) handlersRef.current.onError?.(state.error);
  }, [state]);
}
