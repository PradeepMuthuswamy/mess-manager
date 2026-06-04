'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/shared/form-error';
import { forgotPasswordAction, type ActionState } from '../actions';

const INITIAL: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full transition-ds press"
      disabled={pending}
    >
      {pending ? 'Sending…' : 'Send reset link'}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, INITIAL);

  if (state.ok) {
    return (
      <div className="space-y-4">
        <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
          If that email is on file, a reset link is on its way.
        </p>
        <Link
          href="/sign-in"
          className="block text-center text-sm text-muted-foreground underline-offset-4 transition-ds hover:text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="officer@unit.mil"
        />
      </div>

      <FormError message={state.error} />

      <SubmitButton />

      <Link
        href="/sign-in"
        className="block text-center text-sm text-muted-foreground underline-offset-4 transition-ds hover:text-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
