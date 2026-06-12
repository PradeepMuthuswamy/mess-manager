'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function GroceryNav() {
  const pathname = usePathname();

  const tabs = [
    { href: '/grocery', label: 'Masters' },
    { href: '/grocery/stock', label: 'Stock' },
  ];

  return (
    <nav className="flex items-center gap-6 border-b border-border pb-3">
      {tabs.map((tab) => {
        // Masters is the module index — match exactly so /grocery/stock doesn't
        // also light it up; sub-routes match on prefix.
        const active = tab.href === '/grocery'
          ? pathname === '/grocery'
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
