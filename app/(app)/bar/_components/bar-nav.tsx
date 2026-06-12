'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function BarNav() {
  const pathname = usePathname();

  const tabs = [
    { href: '/bar', label: 'Chits' },
    { href: '/bar/masters', label: 'Masters' },
  ];

  return (
    <nav className="flex items-center gap-6 border-b border-border pb-3">
      {tabs.map((tab) => {
        // Chits is the module index — match exactly so /bar/masters doesn't
        // also light it up; sub-routes match on prefix.
        const active = tab.href === '/bar'
          ? pathname === '/bar'
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
