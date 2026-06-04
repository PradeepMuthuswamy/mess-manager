import Link from 'next/link';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { EditScaleDialog } from './edit-scale-dialog';
import { DeactivateScaleButton } from './deactivate-scale-button';
import type { RationScaleListItem } from '@/lib/ration/types';
import {
  RATION_CLASS_LABEL,
  RATION_TERRAIN_LABEL,
} from '@/lib/schemas/ration';

export function ScaleCard({
  scale,
  canWrite,
}: {
  scale: RationScaleListItem;
  canWrite: boolean;
}) {
  return (
    <Card className="lift flex h-full flex-col shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="font-heading truncate text-base font-semibold tracking-tight">
            {scale.name}
          </span>
          {!scale.is_active ? (
            <Badge variant="outline">Inactive</Badge>
          ) : (
            <Badge variant="success">Active</Badge>
          )}
        </CardTitle>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="secondary">{RATION_CLASS_LABEL[scale.rank_class]}</Badge>
          <Badge variant="info">{RATION_TERRAIN_LABEL[scale.terrain]}</Badge>
        </div>
        <CardDescription className="line-clamp-2 pt-2">
          {scale.description?.trim() || 'No description.'}
        </CardDescription>
        {canWrite ? (
          <CardAction>
            <EditScaleDialog scale={scale} triggerLabel="" triggerVariant="ghost" />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-medium tabular-nums text-foreground">
            {scale.item_count}
          </span>
          <span className="text-sm text-muted-foreground">
            item{scale.item_count === 1 ? '' : 's'} authorised
          </span>
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button asChild size="sm" variant="outline" className="transition-ds">
          <Link href={`/ration/scales/${scale.id}`}>
            Manage <ArrowRight className="size-4" />
          </Link>
        </Button>
        {canWrite && scale.is_active ? (
          <DeactivateScaleButton
            scaleId={scale.id}
            scaleName={scale.name}
          />
        ) : null}
      </CardFooter>
    </Card>
  );
}
