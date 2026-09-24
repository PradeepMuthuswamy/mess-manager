'use client';

import { useFormStatus } from 'react-dom';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Pending copy for every save/submit control. */
export const SAVING_LABEL = 'Saving…';

/** Idle label while idle; `Saving…` while the save is in flight. */
export function savingLabel(pending: boolean, idle: ReactNode): ReactNode {
  return pending ? SAVING_LABEL : idle;
}

/**
 * Submit/save button. Disables immediately and swaps its label to “Saving…”
 * while `pending` is set or the parent form action is in flight.
 * Pass `type="button"` for click handlers that are not form submits.
 */
export function SaveButton({
  pending = false,
  children,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean }) {
  const { pending: formPending } = useFormStatus();
  const busy = pending || formPending;
  return (
    <Button {...props} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? SAVING_LABEL : children}
    </Button>
  );
}
