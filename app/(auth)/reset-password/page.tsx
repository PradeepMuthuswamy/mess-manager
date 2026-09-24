import { redirect } from 'next/navigation';
import { verifyAuthToken } from '@/lib/auth/email-links';
import { ResetPasswordForm } from '../_components/reset-password-form';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawToken = params.token ?? params.token_hash;
  const token = typeof rawToken === 'string' ? rawToken : undefined;

  if (!token) {
    redirect('/sign-in?error=invalid_link');
  }

  const { valid, verification } = await verifyAuthToken(token, 'recovery');
  if (!valid || !verification) {
    redirect('/sign-in?error=invalid_link');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Reset password
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a new password for your account.
        </p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
