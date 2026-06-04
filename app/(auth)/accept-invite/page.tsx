import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AcceptInviteForm } from '../_components/accept-invite-form';

export default async function AcceptInvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
      <AcceptInviteForm />
    </div>
  );
}
