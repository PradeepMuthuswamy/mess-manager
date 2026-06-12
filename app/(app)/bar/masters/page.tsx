import { requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { MastersView } from '@/app/(app)/_shared/masters-view/masters-view';
import type { CategorySlug } from '@/lib/masters/categories';

export const dynamic = 'force-dynamic';

const ALLOWED_SLUGS = [
  'alcohol',
  'cold-drinks',
  'cigars',
  'snacks',
] as const satisfies readonly CategorySlug[];

export default async function BarMastersPage({
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
      basePath="/bar/masters"
      allowedSlugs={ALLOWED_SLUGS}
      searchParams={sp}
      heading="Bar masters"
      description="Manage the unit's bar catalogue — alcohol, cold drinks, cigars, and snacks."
    />
  );
}
