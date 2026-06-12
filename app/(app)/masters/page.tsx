import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-role';
import {
  CATEGORY_SLUGS,
  type CategorySlug,
} from '@/lib/masters/categories';

function isMasterSlug(v: string | undefined): v is CategorySlug {
  return !!v && (CATEGORY_SLUGS as readonly string[]).includes(v);
}

/**
 * Legacy /masters surface, now a pure redirect hub. The catalogue moved into
 * the operational modules: ration → /ration/masters, the bar categories →
 * /bar/masters, grocery → /grocery. No data is fetched here; the destination
 * page owns the gate + data. Keeps old /masters?cat=… links working.
 */
export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  // Gate before learning any destination exists, per the AGENTS.md
  // permissions checklist. The destination page owns the capability check.
  await requireUser();

  const { cat } = await searchParams;
  const slug = isMasterSlug(cat) ? cat : null;

  switch (slug) {
    case 'ration':
    case null:
      redirect('/ration/masters');
    case 'grocery':
      redirect('/grocery');
    case 'alcohol':
    case 'cold-drinks':
    case 'cigars':
    case 'snacks':
      redirect(`/bar/masters?cat=${slug}`);
  }
}
