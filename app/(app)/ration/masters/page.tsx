import { requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { MastersView } from '@/app/(app)/masters/_components/masters-view';

export const dynamic = 'force-dynamic';

export default async function RationMastersPage({
  searchParams,
}: {
  searchParams: Promise<{
    cat?: string;
    q?: string;
    inactive?: string;
    page?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}) {
  // Explicit page gate per the AGENTS.md permissions checklist; MastersView
  // carries the same gate as defence-in-depth.
  const user = await requireUser();
  await requireCapability('masters.read', user.activeUnitId ?? null);

  const sp = await searchParams;

  return (
    <MastersView
      basePath="/ration/masters"
      allowedSlugs={['ration']}
      searchParams={sp}
      heading="Ration masters"
      description="Manage the ration item catalogue and per-scale authorisations for your unit."
    />
  );
}
