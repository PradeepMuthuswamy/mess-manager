import { getCurrentUser } from '@/lib/auth/get-current-user';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { VerifyMfaForm } from './verify-form';

export const dynamic = 'force-dynamic';

function safeNext(value: string | string[] | undefined): string {
  if (typeof value !== 'string') return '/dashboard';
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export default async function VerifyMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  const cookieStore = await cookies();
  const hasTwoFactorCookie = cookieStore.getAll().some((c) => c.name.includes('two_factor'));

  if (!user && !hasTwoFactorCookie) {
    redirect('/sign-in');
  }

  const params = await searchParams;
  const next = safeNext(params.next);

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Two-Factor Authentication
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit verification code from your authenticator app.
        </p>
      </div>
      <VerifyMfaForm next={next} />
    </div>
  );
}
