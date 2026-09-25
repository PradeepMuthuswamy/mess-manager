'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { navForPath, navItemMatchesModules, type NavItem } from './nav-config';
import { NavIcon } from './nav-icons';
import { userHasCapability } from '@/lib/auth/capabilities';
import type { AuthUser } from '@/lib/auth/types';
import { useAppContext } from '@/lib/auth/context';

function canSee(user: AuthUser, item: NavItem): boolean {
  if (item.requiresRole && !item.requiresRole.includes(user.role)) return false;
  if (item.requires) {
    const caps = Array.isArray(item.requires) ? item.requires : [item.requires];
    return caps.some((c) => userHasCapability(user, c));
  }
  return true;
}

function NavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const visibleChildren = item.children ?? [];
  const active = item.href
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : visibleChildren.some((c) => c.href && pathname.startsWith(c.href));

  if (visibleChildren.length === 0 && item.href) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
          <Link href={item.href} prefetch={false}>
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} tooltip={item.label}>
        <NavIcon name={item.icon} />
        <span>{item.label}</span>
      </SidebarMenuButton>
      <SidebarMenuSub>
        {visibleChildren.map((child) => {
          const childActive = child.href
            ? pathname === child.href || pathname.startsWith(`${child.href}/`)
            : false;
          return (
            <SidebarMenuSubItem key={child.label}>
              <SidebarMenuSubButton asChild isActive={childActive}>
                <Link href={child.href!} prefetch={false}>
                  <NavIcon name={child.icon} />
                  <span>{child.label}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          );
        })}
      </SidebarMenuSub>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ enabledModules }: { enabledModules: readonly string[] }) {
  const { user } = useAppContext();
  const pathname = usePathname();
  const { diner, ops } = navForPath(pathname);

  const visibleDiner = diner.filter(
    (item) => canSee(user, item) && navItemMatchesModules(item, enabledModules),
  );
  const dinerHrefs = new Set(visibleDiner.map((item) => item.href).filter(Boolean));
  const visibleOps = ops.filter((item) => {
    if (!canSee(user, item) || !navItemMatchesModules(item, enabledModules)) return false;
    if (item.href && dinerHrefs.has(item.href)) return false;
    if (item.children) {
      return item.children.some((child) => canSee(user, child));
    }
    return true;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="font-heading font-semibold tracking-tight text-sidebar-foreground">
          Officers Mess
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 py-2 text-xs uppercase tracking-wide text-muted-foreground">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleDiner.map((item) => (
                <NavLink
                  key={item.label}
                  item={{
                    ...item,
                    children: item.children?.filter((child) => canSee(user, child)),
                  }}
                  pathname={pathname}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleOps.length > 0 && (
          <SidebarGroup className="mt-2">
            <SidebarGroupLabel className="px-2 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              Mess Operations
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleOps.map((item) => (
                  <NavLink
                    key={item.label}
                    item={{
                      ...item,
                      children: item.children?.filter((child) => canSee(user, child)),
                    }}
                    pathname={pathname}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
