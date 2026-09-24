import { Skeleton } from '@/components/ui/skeleton';

export default function GuestRoomsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>

      {/* Tab bar skeleton */}
      <Skeleton className="h-12 rounded-md" />

      {/* Calendar / content skeleton */}
      <Skeleton className="h-[500px] rounded-lg" />
    </div>
  );
}
