'use client';

import { savingLabel } from '@/components/shared/save-submit';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/shared/form-error';
import { toast } from 'sonner';
import { useActionResult } from '@/hooks/use-action-result';
import { acceptInviteAction, type ActionState } from '../actions';

const INITIAL: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full transition-ds press"
      disabled={pending}
    >
      {savingLabel(pending, 'Accept invite')}
    </Button>
  );
}

export function AcceptInviteForm() {
  const [state, formAction] = useActionState(acceptInviteAction, INITIAL);
  useActionResult(state, {
    onError: (message) => toast.error(message),
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [clientError, setClientError] = useState<string | undefined>();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (password !== confirm) {
      e.preventDefault();
      const message = 'Passwords do not match.';
      setClientError(message);
      toast.error(message);
      return;
    }
    if (password.length < 8) {
      e.preventDefault();
      const message = 'Password must be at least 8 characters.';
      setClientError(message);
      toast.error(message);
      return;
    }
    setClientError(undefined);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">
          Full name{' '}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          maxLength={120}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <FormError message={clientError} />
      </div>

      <FormError message={state.error} />

      <SubmitButton />
    </form>
  );
}
