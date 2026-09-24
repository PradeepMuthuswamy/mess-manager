import { redirect } from 'next/navigation';
import { verifyAuthToken } from '@/lib/auth/email-links';
import { AcceptInviteForm } from '../_components/accept-invite-form';

export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({
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

  const { valid, verification } = await verifyAuthToken(token, 'invite');
  if (!valid || !verification) {
    redirect('/sign-in?error=invalid_link');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Accept invite
        </h1>
        <p className="text-sm text-muted-foreground">
          Set your password to activate your account.
        </p>
      </div>
      <AcceptInviteForm
        token={token}
        initialFullName={verification.metadata?.fullName}
      />
    </div>
  );
}
