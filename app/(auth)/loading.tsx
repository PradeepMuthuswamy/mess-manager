import { SkeletonRows } from '@/components/shared/skeleton-rows';

export default function AuthLoading() {
  return (
    <div className="flex min-h-[120px] items-center justify-center p-6" aria-busy="true" aria-label="Loading">
      <div className="w-full max-w-sm space-y-3">
        <SkeletonRows rows={3} cols={1} />
      </div>
    </div>
  );
}
