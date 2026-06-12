'use client';

import Link from 'next/link';
import { useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/shared/form-error';
import { signInAction, sendMagicLinkAction, type ActionState } from '../actions';

const INITIAL: ActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="w-full transition-ds press font-semibold"
      disabled={pending}
    >
      {pending ? 'Processing…' : label}
    </Button>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<'password' | 'magiclink'>('password');
  
  const [state, formAction] = useActionState(
    mode === 'password' ? signInAction : sendMagicLinkAction,
    INITIAL
  );

  if (mode === 'magiclink' && state.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-800 dark:text-emerald-400">
          <p className="font-semibold text-base mb-1">Check your inbox 📬</p>
          <p className="opacity-90">If your account exists, we have sent a secure magic link to sign in instantly.</p>
        </div>
        <Button
          variant="outline"
          className="w-full transition-ds"
          onClick={() => {
            setMode('password');
            state.ok = undefined;
            state.error = undefined;
          }}
        >
          Sign in with Password
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      {mode === 'password' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 transition-ds hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
          />
        </div>
      ) : null}

      <FormError message={state.error} />

      <SubmitButton label={mode === 'password' ? 'Sign in' : 'Send Magic Link'} />

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'password' ? 'magiclink' : 'password');
            state.ok = undefined;
            state.error = undefined;
          }}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline transition-colors focus:outline-none"
        >
          {mode === 'password' ? 'Or sign in with a Magic Link' : 'Or sign in with your Password'}
        </button>
      </div>
    </form>
  );
}
