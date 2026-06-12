'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Lucide from 'lucide-react';
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
import { navForPath, type NavItem } from './nav-config';
import { userHasCapability } from '@/lib/auth/capabilities';
import type { AuthUser } from '@/lib/auth/types';
import { useAppContext } from '@/lib/auth/context';

function iconOf(name: string) {
  const I = (Lucide as unknown as Record<string, unknown>)[name] as
    | React.ComponentType<{ className?: string }>
    | undefined;
  return I ?? Lucide.Circle;
}

function canSee(user: AuthUser, item: NavItem): boolean {
  if (item.requiresRole && !item.requiresRole.includes(user.role)) return false;
  if (item.requires) {
    const caps = Array.isArray(item.requires) ? item.requires : [item.requires];
    return caps.some((c) => userHasCapability(user, c));
  }
  return true;
}

export function AppSidebar() {
  const { user } = useAppContext();
  const pathname = usePathname();
  const { diner, ops } = navForPath(pathname);
  const visibleOps = ops.filter((item) => canSee(user, item));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border">
        <div className="font-heading font-semibold tracking-tight text-sidebar-foreground">
          Officers Mess
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Member Workspace */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wide text-muted-foreground px-2 py-2">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {diner.map((item) => {
                if (!canSee(user, item)) return null;
                const visibleChildren = item.children?.filter((c) => canSee(user, c)) ?? [];
                if (item.children && visibleChildren.length === 0) return null;

                const Icon = iconOf(item.icon);
                const active = item.href
                  ? pathname === item.href || pathname.startsWith(item.href + '/')
                  : visibleChildren.some((c) => c.href && pathname.startsWith(c.href));

                if (visibleChildren.length === 0 && item.href) {
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="transition-ds"
                      >
                        <Link href={item.href}>
                          <Icon className="size-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className="transition-ds"
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      {visibleChildren.map((c) => {
                        const CI = iconOf(c.icon);
                        const childActive = c.href
                          ? pathname === c.href || pathname.startsWith(c.href + '/')
                          : false;
                        return (
                          <SidebarMenuSubItem key={c.label}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={childActive}
                              className="transition-ds"
                            >
                              <Link href={c.href!}>
                                <CI className="size-4 shrink-0" />
                                <span>{c.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Mess Operations */}
        {visibleOps.length > 0 && (
          <SidebarGroup className="mt-2">
            <SidebarGroupLabel className="text-xs uppercase tracking-wide text-muted-foreground px-2 py-2">
              Mess Operations
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleOps.map((item) => {
                  const visibleChildren = item.children?.filter((c) => canSee(user, c)) ?? [];
                  if (item.children && visibleChildren.length === 0) return null;

                  const Icon = iconOf(item.icon);
                  const active = item.href
                    ? pathname === item.href || pathname.startsWith(item.href + '/')
                    : visibleChildren.some((c) => c.href && pathname.startsWith(c.href));

                  if (visibleChildren.length === 0 && item.href) {
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className="transition-ds"
                        >
                          <Link href={item.href}>
                            <Icon className="size-4 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }

                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        className="transition-ds"
                      >
                        <Icon className="size-4 shrink-0" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      <SidebarMenuSub>
                        {visibleChildren.map((c) => {
                          const CI = iconOf(c.icon);
                          const childActive = c.href
                            ? pathname === c.href || pathname.startsWith(c.href + '/')
                            : false;
                          return (
                            <SidebarMenuSubItem key={c.label}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={childActive}
                                className="transition-ds"
                              >
                                <Link href={c.href!}>
                                  <CI className="size-4 shrink-0" />
                                  <span>{c.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
