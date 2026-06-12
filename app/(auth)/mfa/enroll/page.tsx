import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-role';
import { EnrollMfaForm } from './enroll-form';

export const dynamic = 'force-dynamic';

export default async function EnrollMfaPage() {
  const user = await requireUser();
  
  // Strict MFA is only for admins
  if (user.role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Set up Authenticator
        </h1>
        <p className="text-sm text-muted-foreground">
          Admins are required to secure their accounts with Multi-Factor Authentication.
        </p>
      </div>
      <EnrollMfaForm email={user.email} />
    </div>
  );
}
