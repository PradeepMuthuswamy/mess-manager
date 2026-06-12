import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-role';
import { requireCapability, userHasCapability } from '@/lib/auth/require-capability';
import {
  getScale,
  listEligibleItems,
  listScaleItemsCurrent,
} from '@/lib/ration/queries';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { ScaleItemsTable } from '../../_components/scale-items-table';
import { EditScaleDialog } from '../../_components/edit-scale-dialog';
import { DeactivateScaleButton } from '../../_components/deactivate-scale-button';

export const dynamic = 'force-dynamic';

export default async function RationScalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const scale = await getScale(id);
  if (!scale) notFound();

  await requireCapability('ration.read', scale.unit_id);

  const [items, eligible] = await Promise.all([
    listScaleItemsCurrent(scale.id),
    listEligibleItems(scale.unit_id ?? ''),
  ]);

  const canWrite = userHasCapability(user, 'ration.adjust', scale.unit_id ?? undefined);

  return (
    <section className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/ration">Ration</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{scale.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-3xl font-bold tracking-tight">
              {scale.name}
            </h1>
            {!scale.is_active ? (
              <Badge variant="destructive">Inactive</Badge>
            ) : null}
          </div>
          {scale.description ? (
            <p className="max-w-prose text-sm text-muted-foreground">
              {scale.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No description.</p>
          )}
        </div>

        {canWrite ? (
          <div className="flex items-center gap-2">
            <EditScaleDialog scale={scale} />
            {scale.is_active ? (
              <DeactivateScaleButton
                scaleId={scale.id}
                scaleName={scale.name}
                redirectTo="/ration"
              />
            ) : null}
          </div>
        ) : null}
      </header>

      <ScaleItemsTable
        scaleId={scale.id}
        unitId={scale.unit_id ?? ''}
        rows={items}
        eligible={eligible}
        canWrite={canWrite}
      />
    </section>
  );
}
