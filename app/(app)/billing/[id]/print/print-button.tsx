'use client';

import Link from 'next/link';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintButton({ backHref = '/billing' }: { backHref?: string }) {
  return (
    <>
      <style>{`
        @media print {
          .bill-statement-print-actions { display: none !important; }
        }
      `}</style>
      <div className="bill-statement-print-actions flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href={backHref}>Back to billing</Link>
        </Button>
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
      </div>
    </>
  );
}
