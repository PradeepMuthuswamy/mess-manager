'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function GuestRoomsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[guest-rooms] page error:', error);
  }, [error]);

  const isSchemaCache = error.message?.includes('schema cache');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
          Guest Rooms
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage room inventory, bookings, and billing.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-12 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            {isSchemaCache
              ? 'Guest rooms feature is being set up'
              : 'Something went wrong'}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {isSchemaCache
              ? 'The guest rooms database tables are not yet available. This usually means a migration is pending deployment. Please contact your administrator.'
              : error.message || 'An unexpected error occurred while loading guest rooms.'}
          </p>
        </div>
        <Button variant="outline" onClick={reset} className="mt-2">
          Try again
        </Button>
      </div>
    </div>
  );
}
