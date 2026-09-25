import { Skeleton } from '@/components/ui/skeleton';

export default function RootLoading() {
  return (
    <div
      className="flex min-h-screen w-full flex-col bg-background"
      aria-busy="true"
      aria-label="Loading application"
    >
      <header className="flex h-14 items-center border-b border-border px-6">
        <Skeleton className="h-6 w-36 rounded" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-64 border-r border-border p-4 md:block">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </aside>
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48 rounded" />
              <Skeleton className="h-4 w-72 rounded" />
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </main>
      </div>
    </div>
  );
}
