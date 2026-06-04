'use client';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/app/(auth)/actions';
import type { AuthUser } from '@/lib/auth/types';

export function UserMenu({ user }: { user: AuthUser }) {
  const initials =
    (user.displayName ?? user.email ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="transition-ds rounded-full size-8 ring-offset-background hover:ring-2 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs font-medium bg-accent text-accent-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 shadow-lg">
        <DropdownMenuLabel className="pb-2">
          {user.displayName ? (
            <div className="truncate text-sm font-medium text-foreground">{user.displayName}</div>
          ) : null}
          <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="transition-ds">
          <Link href="/settings">Profile &amp; settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild className="transition-ds text-destructive focus:text-destructive">
            <button type="submit" className="w-full text-left cursor-pointer">
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
