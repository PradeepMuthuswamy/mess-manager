'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

export function AuthError({ error }: { error?: string }) {
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {error}
    </p>
  );
}
