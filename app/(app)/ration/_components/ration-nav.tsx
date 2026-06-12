'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function RationNav() {
  const pathname = usePathname();

  const tabs = [
    { href: '/ration', label: 'Authorisations' },
    { href: '/ration/consumption', label: 'Daily Consumption' },
    { href: '/ration/ledger', label: 'Stock Ledger' },
  ];

  return (
    <nav className="flex items-center gap-6 border-b border-border pb-3">
      {tabs.map((tab) => {
        // Matches exactly for /ration, or checks prefix for sub-routes
        const active = tab.href === '/ration'
          ? pathname === '/ration' || pathname.startsWith('/ration/scales')
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "text-sm font-medium transition-colors hover:text-foreground pb-2 border-b-2 -mb-[13px] border-transparent",
              active ? "text-foreground border-primary font-semibold" : "text-muted-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
