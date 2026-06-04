import { requireUser } from '@/lib/auth/require-role';
import {
  requireCapability,
  userHasCapability,
} from '@/lib/auth/require-capability';
import {
  listMasterItems,
  listMasterAuthorisations,
} from '@/lib/masters/queries';
import {
  CATEGORY_META,
  categoryFromSlug,
  type CategorySlug,
} from '@/lib/masters/categories';
import type { AuthorisationChip } from '@/lib/masters/types';
import { createClient } from '@/lib/supabase/server';
import { rankClassForMessType } from '@/lib/ration/mess-type';
import type { MessType } from '@/lib/schemas/attendance';
import type { RationClass, RationTerrain } from '@/lib/schemas/ration';

import { MasterTable } from './_components/master-table';
import { MastersCategoryNav } from './_components/masters-category-nav';

// The five operational master categories (room is guest-room-only — no
// master UI). Mirrors the admin Masters tabs; `?cat=` keeps this single
// route SSR + linkable like /inventory.
const MASTER_SLUGS = [
  'ration',
  'soft-drinks',
  'alcohol',
  'cigar',
  'grocery',
] as const satisfies readonly CategorySlug[];

type MasterSlug = (typeof MASTER_SLUGS)[number];

function isMasterSlug(v: string | undefined): v is MasterSlug {
  return !!v && (MASTER_SLUGS as readonly string[]).includes(v);
}

/**
 * Operational catalogue surface. Reuses the admin MasterTable but is gated
 * purely by the `masters` capability (not the admin role-shell), so a
 * Quartermaster / Mess Secretary / unit_admin can browse and — with
 * `masters.write` — manage the full catalogue for their unit. The server
 * actions remain the real 3-layer enforcement; `canWrite` only hides
 * controls for `masters.read`-only users.
 */
export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string; inactive?: string }>;
}) {
  const user = await requireUser();
  await requireCapability('masters.read', user.activeUnitId ?? null);

  const { cat, q, inactive } = await searchParams;
  const slug: MasterSlug = isMasterSlug(cat) ? cat : 'ration';
  const category = categoryFromSlug(slug);

  const allowGlobal = userHasCapability(user, 'masters.write.global');
  const canWrite = userHasCapability(user, 'masters.write', user.activeUnitId);

  const rows = await listMasterItems(category, {
    q,
    activeUnitId: user.activeUnitId,
    isAllUnits: user.isAllUnits,
    includeInactive: inactive === '1',
  });

  // Super admins see the full rank×terrain matrix. Everyone else is scoped to
  // their active unit's configured mess_type (→rank class) and terrain.
  const isSuperAdmin = user.role === 'admin';

  let authorisations: Record<string, AuthorisationChip[]> | undefined;
  let rationScope:
    | { rankClass: RationClass | null; terrain: RationTerrain | null }
    | null = null;

  if (category === 'ration') {
    if (!isSuperAdmin && user.activeUnitId) {
      const supabase = await createClient();
      const { data: unitRow } = await supabase
        .from('units')
        .select('mess_type, terrain')
        .eq('id', user.activeUnitId)
        .single();

      const scopeRank = rankClassForMessType(
        (unitRow?.mess_type as MessType | null) ?? null,
      );
      const scopeTerrain = (unitRow?.terrain as RationTerrain | null) ?? null;

      // Both unconstrained ⇒ unit is unconfigured; show the full filter UI.
      if (scopeRank !== null || scopeTerrain !== null) {
        rationScope = { rankClass: scopeRank, terrain: scopeTerrain };
      }
    }

    const authMap = await listMasterAuthorisations(
      user.activeUnitId,
      isSuperAdmin || rationScope === null
        ? undefined
        : { rankClass: rationScope.rankClass, terrain: rationScope.terrain },
    );
    authorisations = {};
    for (const [k, v] of authMap) authorisations[k] = v;
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold leading-[1.3] tracking-[-0.01em] text-foreground">
          Masters
        </h1>
        <p className="text-sm text-muted-foreground">
          The full item catalogue for this unit. Pricing for stock is recorded
          per purchase lot in Inventory, not here.
        </p>
      </div>

      <MastersCategoryNav active={category} />

      <div className="space-y-1">
        <h2 className="font-heading text-base font-semibold leading-[1.3] tracking-[-0.01em] text-foreground">
          {CATEGORY_META[category].title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {CATEGORY_META[category].description}
        </p>
      </div>

      <MasterTable
        category={category}
        slug={slug}
        rows={rows}
        authorisations={authorisations}
        rationScope={rationScope}
        allowGlobal={allowGlobal}
        defaultUnitId={user.activeUnitId}
        isAllUnits={user.isAllUnits}
        canWrite={canWrite}
      />
    </section>
  );
}
