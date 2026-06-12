import { requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { MastersView } from '@/app/(app)/masters/_components/masters-view';

export const dynamic = 'force-dynamic';

/**
 * Grocery module — the per-unit grocery catalogue, backed by the reusable
 * MastersView restricted to the `grocery` slug. MastersView carries its own
 * gate as defence-in-depth; this page adds its own explicit gate per the
 * AGENTS.md permissions checklist.
 */
export default async function GroceryPage({
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
  const user = await requireUser();
  await requireCapability('masters.read', user.activeUnitId ?? null);

  const sp = await searchParams;

  return (
    <MastersView
      basePath="/grocery"
      allowedSlugs={['grocery']}
      searchParams={sp}
      heading="Grocery"
      description="The unit grocery catalogue — general grocery items and their current rates."
    />
  );
}
