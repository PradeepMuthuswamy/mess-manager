import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonRows } from '@/components/shared/skeleton-rows';

export default function Loading() {
  return (
    <div className="p-6 space-y-6" aria-busy="true" aria-label="Loading content">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 font-heading" />
        <Skeleton className="h-4 w-72" />
      </div>
      <SkeletonRows rows={6} cols={4} />
    </div>
  );
}
