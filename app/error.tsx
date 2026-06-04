'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/error-state';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="w-full max-w-md">
        <ErrorState
          title="Something went wrong"
          description={
            error.digest
              ? `An unexpected error occurred. The error was logged.\nRef: ${error.digest}`
              : 'An unexpected error occurred. The error was logged. Please try again.'
          }
          action={
            <div className="flex gap-2 justify-center flex-wrap">
              <Button onClick={() => reset()}>Try again</Button>
              <Button variant="outline" asChild>
                <Link href="/">Go home</Link>
              </Button>
            </div>
          }
        />
      </div>
    </main>
  );
}
