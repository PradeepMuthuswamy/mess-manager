'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserMenu } from './user-menu';
import { ThemeToggle } from './theme-toggle';
import { useAppContext } from '@/lib/auth/context';
import { UnitSwitcher } from './unit-switcher';

function titleCase(s: string) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppNavbar({
  units,
}: {
  units: { id: string; name: string; code: string }[];
}) {
  const { user } = useAppContext();
  const pathname = usePathname();
  const segs = pathname.split('/').filter(Boolean);
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background/95 backdrop-blur-sm px-4">
      <SidebarTrigger className="transition-ds" />
      <div className="h-4 w-px bg-border" aria-hidden="true" />
      <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
        {segs.map((s, i) => {
          const href = '/' + segs.slice(0, i + 1).join('/');
          const isLast = i === segs.length - 1;
          return (
            <span key={href} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="select-none opacity-40 text-xs">/</span>}
              {isLast ? (
                <span className="text-foreground font-medium truncate">{titleCase(s)}</span>
              ) : (
                <Link
                  href={href}
                  className="transition-ds hover:text-foreground truncate"
                >
                  {titleCase(s)}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        {user.role === 'super_admin' && <UnitSwitcher current={user.activeUnitId} units={units} />}
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
