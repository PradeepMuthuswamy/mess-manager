import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-role';
import { VerifyMfaForm } from './verify-form';

export const dynamic = 'force-dynamic';

export default async function VerifyMfaPage() {
  const user = await requireUser();
  
  // Strict MFA is only for admins
  if (user.role !== 'admin') {
    redirect('/dashboard');
  }

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
      <VerifyMfaForm />
    </div>
  );
}
