import Link from 'next/link';
import { requireUser } from '@/lib/auth/require-role';
import { requireCapability, userHasCapability } from '@/lib/auth/require-capability';
import { createClient } from '@/lib/supabase/server';
import {
  listScales,
  getScaleByDimensions,
  listScaleItemsCurrent,
  listEligibleItems,
} from '@/lib/ration/queries';
import {
  rationClassEnum,
  rationTerrainEnum,
  RATION_CLASS_LABEL,
  RATION_TERRAIN_LABEL,
  type RationClass,
  type RationTerrain,
} from '@/lib/schemas/ration';
import { MESS_TYPE_LABEL, type MessType } from '@/lib/schemas/attendance';
import { rankClassForMessType } from '@/lib/ration/mess-type';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';
import { NewScaleDialog } from './_components/new-scale-dialog';
import { ScaleItemsTable } from './_components/scale-items-table';
import { TerrainSwitcher } from './_components/terrain-switcher';
import { EmptyState } from '@/components/shared/empty-state';

export const dynamic = 'force-dynamic';

function parseRankClass(v: string | undefined): RationClass {
  return (rationClassEnum as readonly string[]).includes(v ?? '')
    ? (v as RationClass)
    : 'officer';
}
function parseTerrain(v: string | undefined): RationTerrain {
  return (rationTerrainEnum as readonly string[]).includes(v ?? '')
    ? (v as RationTerrain)
    : 'plains';
}

export default async function RationPage({
  searchParams,
}: {
  searchParams: Promise<{ terrain?: string; rank_class?: string }>;
}) {
  const user = await requireUser();
  await requireCapability('ration.read', user.activeUnitId ?? undefined);

  const sp = await searchParams;

  if (!user.activeUnitId) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Ration authorisations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daily per-person scales by unit, rank class, and terrain.
          </p>
        </header>
        <EmptyState
          title="Pick a unit to continue"
          description="You're in all-units mode. Use the unit switcher in the navbar to choose a unit and view its ration scales."
        />
      </section>
    );
  }

  const unitId = user.activeUnitId;
  const supabase = await createClient();
  const { data: unitRow } = await supabase
    .from('units')
    .select('name, code, mess_type, terrain')
    .eq('id', unitId)
    .maybeSingle();

  const messType = (unitRow?.mess_type as MessType | null) ?? null;
  const unitTerrain = (unitRow?.terrain as RationTerrain | null) ?? null;
  // mess_type officer/jco/or map 1:1 to a rank_class; 'combined' / unset do
  // not, so the page falls back to the full selector for those.
  const mappedRank: RationClass | null = rankClassForMessType(messType);
  const locked = mappedRank !== null;

  const rankClass: RationClass = locked
    ? (mappedRank as RationClass)
    : parseRankClass(sp.rank_class);
  const terrain: RationTerrain = locked
    ? (unitTerrain ?? 'plains')
    : parseTerrain(sp.terrain);

  const [terrainScales, scale, eligible] = await Promise.all([
    listScales({ unitId, terrain }),
    getScaleByDimensions(unitId, rankClass, terrain),
    listEligibleItems(unitId),
  ]);
  const items = scale ? await listScaleItemsCurrent(scale.id) : [];

  const canWrite = userHasCapability(user, 'ration.adjust', unitId);
  const unitLabel = unitRow?.name ?? 'this unit';

  // Rank classes that already have a scale for this terrain — show as small
  // counts so the user can see at a glance what's covered.
  const rankCounts = new Map<RationClass, number>();
  for (const s of terrainScales) {
    rankCounts.set(s.rank_class, (rankCounts.get(s.rank_class) ?? 0) + s.item_count);
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Ration authorisations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {locked
              ? `${MESS_TYPE_LABEL[messType as MessType]} mess · ${RATION_TERRAIN_LABEL[terrain]} — ${unitLabel}.`
              : `Daily per-person scales for ${unitLabel}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!locked ? (
            <TerrainSwitcher terrain={terrain} rankClass={rankClass} />
          ) : null}
          {canWrite ? (
            <NewScaleDialog
              unitId={unitId}
              defaultRankClass={rankClass}
              defaultTerrain={terrain}
            />
          ) : null}
        </div>
      </header>

      {/* Rank-class tabs — only when the unit's mess type doesn't pin a
          single authorisation. Links so they survive a hard refresh. */}
      {!locked && (
      <nav
        aria-label="Rank class"
        className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
      >
        {rationClassEnum.map((c) => {
          const active = c === rankClass;
          const count = rankCounts.get(c);
          return (
            <Button
              key={c}
              asChild
              size="sm"
              variant={active ? 'default' : 'ghost'}
              className="transition-ds rounded-md"
            >
              <Link
                href={{
                  pathname: '/ration',
                  query: { terrain, rank_class: c },
                }}
              >
                <span>{RATION_CLASS_LABEL[c]}</span>
                {count != null ? (
                  <Badge
                    variant={active ? 'secondary' : 'outline'}
                    className="ml-1 font-mono tabular-nums"
                  >
                    {count}
                  </Badge>
                ) : null}
              </Link>
            </Button>
          );
        })}
      </nav>
      )}

      {!locked && messType == null ? (
        <p className="text-sm text-muted-foreground">
          Tip: set this unit&apos;s mess type in{' '}
          <Link href="/settings" className="underline">
            Settings
          </Link>{' '}
          to focus this page on a single authorisation.
        </p>
      ) : null}

      {scale ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg font-semibold tracking-tight">{scale.name}</h2>
            <Badge variant="secondary">{RATION_CLASS_LABEL[rankClass]}</Badge>
            <Badge variant="info">{RATION_TERRAIN_LABEL[terrain]}</Badge>
            {!scale.is_active ? <Badge variant="destructive">Inactive</Badge> : null}
            {scale.is_active ? <Badge variant="success">Active</Badge> : null}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" asChild className="transition-ds">
              <Link href={`/ration/scales/${scale.id}`}>
                Open detail page <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <ScaleItemsTable
            scaleId={scale.id}
            unitId={unitId}
            rows={items}
            eligible={eligible}
            canWrite={canWrite}
          />
        </div>
      ) : (
        <EmptyState
          title={`No ${RATION_CLASS_LABEL[rankClass]} scale for ${RATION_TERRAIN_LABEL[terrain]}`}
          description="Create one to start authorising items for this combination. Each scale is unique per (rank class × terrain) within a unit."
          action={canWrite ? (
            <NewScaleDialog
              unitId={unitId}
              defaultRankClass={rankClass}
              defaultTerrain={terrain}
            />
          ) : undefined}
        />
      )}
    </section>
  );
}
