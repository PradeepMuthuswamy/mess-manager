'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/auth-client';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { FormError } from '@/components/shared/form-error';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function EnrollMfaForm({ email }: { email: string }) {
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    async function startEnrollment() {
      try {
        setIsInitializing(true);
        setError(null);

        const res = await authClient.twoFactor.enable({
          password: '',
        });

        if (res.error) {
          if (active) setError(res.error.message || 'Failed to start MFA setup');
          return;
        }

        if (active && res.data) {
          const totpURI = (res.data as any).totpURI;
          if (totpURI) {
            try {
              const url = new URL(totpURI);
              const secretParam = url.searchParams.get('secret');
              setSecret(secretParam);
            } catch {
              // Ignore URL parse error
            }
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpURI)}`;
            setQrCode(qrUrl);
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to initialize MFA enrollment');
        }
      } finally {
        if (active) setIsInitializing(false);
      }
    }

    startEnrollment();
    return () => {
      active = false;
    };
  }, [email, router]);

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

        toast.success('MFA set up successfully!');
        router.push('/dashboard');
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

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Preparing secure QR code...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleVerify} className="space-y-6">
      <div className="flex flex-col items-center justify-center p-4 border border-border rounded-lg bg-card/50">
        {qrCode ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrCode}
            alt="MFA QR Code"
            className="size-48 qr-surface p-2 rounded-md shadow-xs bg-white"
          />
        ) : (
          <div className="size-48 bg-muted flex items-center justify-center text-xs text-muted-foreground">
            QR code unavailable
          </div>
        )}
        <p className="mt-3 text-xs text-center text-muted-foreground max-w-xs">
          Scan this QR code with Google Authenticator, Microsoft Authenticator, or any TOTP client.
        </p>
      </div>

      {secret && (
        <div className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/40 border border-border">
          <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
            Secret Key (Manual Entry)
          </span>
          <span className="font-mono text-xs select-all break-all text-foreground/80">
            {secret}
          </span>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-medium text-foreground">Verification Code</span>
        <InputOTP
          maxLength={6}
          value={code}
          onChange={setCode}
          disabled={pending}
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
        <p className="text-xs text-muted-foreground">Enter the 6-digit code from your app.</p>
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
            'Verify & Complete Setup'
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
