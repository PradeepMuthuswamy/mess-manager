import { Button } from '@/components/ui/button';
import { Receipt, Scissors, Users, Utensils, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

export type SecretaryShortcutsProps = {
  readOnly: boolean;
};

type Shortcut = {
  href: string;
  label: string;
  icon: LucideIcon;
  variant: 'default' | 'outline' | 'destructive';
  destructive?: boolean;
};

const SHORTCUTS: Shortcut[] = [
  { href: '/billing', label: 'Billing', icon: Receipt, variant: 'default' },
  { href: '/messing', label: 'Messing', icon: Utensils, variant: 'outline' },
  { href: '/users', label: 'Users', icon: Users, variant: 'outline' },
  {
    href: '/messing/cuts',
    label: 'Messing',
    icon: Scissors,
    variant: 'destructive',
    destructive: true,
  },
];

export function SecretaryShortcuts({ readOnly }: SecretaryShortcutsProps) {
  const shortcuts = SHORTCUTS.filter((item) => !(readOnly && item.destructive));

  return (
    <nav aria-label="Secretary shortcuts" className="flex flex-wrap gap-2">
      {shortcuts.map((item) => {
        const Icon = item.icon;
        return (
          <Button key={item.href} size="sm" variant={item.variant} asChild>
            <Link href={item.href}>
              <Icon data-icon="inline-start" />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
