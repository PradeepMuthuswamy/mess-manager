'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/error-state';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="p-6 max-w-lg">
      <ErrorState
        title="Something went wrong"
        description={
          error.digest
            ? `${error.message || 'Unexpected error in this section.'} (Ref: ${error.digest})`
            : (error.message || 'Unexpected error in this section.')
        }
        action={
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => reset()}>Try again</Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
