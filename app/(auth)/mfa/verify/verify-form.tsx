'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/auth-client';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { FormError } from '@/components/shared/form-error';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function VerifyMfaForm({ next = '/dashboard' }: { next?: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    startTransition(async () => {
      try {
        setError(null);

        const res = await authClient.twoFactor.verifyTotp({
          code,
        });

        if (res.error) {
          setError(res.error.message || 'Invalid verification code');
          return;
        }

        toast.success('Sign in verified!');
        router.push(next);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed');
      }
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <form onSubmit={handleVerify} className="space-y-6">
      <div className="flex flex-col items-center gap-2 py-4">
        <span className="text-sm font-medium text-foreground">Verification Code</span>
        <InputOTP
          maxLength={6}
          value={code}
          onChange={setCode}
          disabled={pending}
          autoFocus
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
        <p className="text-xs text-muted-foreground mt-1">Enter the 6-digit code from your app.</p>
      </div>

      <FormError message={error} />

      <div className="flex flex-col gap-2 pt-2">
        <Button
          type="submit"
          disabled={pending || code.length !== 6}
          className="w-full transition-ds press"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify Sign in'
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleSignOut}
          disabled={pending}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          Cancel &amp; Sign out
        </Button>
      </div>
    </form>
  );
}
