import { Button } from '@/components/ui/button';
import { ClipboardCheck, LogIn, Wheat, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

export type MobileActionStripProps = {
  canRooms: boolean;
  canApprove: boolean;
  canRation: boolean;
};

type ActionKey = keyof MobileActionStripProps;

type Action = {
  key: ActionKey;
  href: string;
  label: string;
  icon: LucideIcon;
};

const ACTIONS: Action[] = [
  { key: 'canRooms', href: '/guest-rooms', label: 'Check in guests', icon: LogIn },
  { key: 'canApprove', href: '/messing', label: 'Approve register', icon: ClipboardCheck },
  { key: 'canRation', href: '/ration', label: 'Post ration', icon: Wheat },
];

export function MobileActionStrip({
  canRooms,
  canApprove,
  canRation,
}: MobileActionStripProps) {
  const enabled: MobileActionStripProps = { canRooms, canApprove, canRation };
  const actions = ACTIONS.filter((item) => enabled[item.key]);

  if (actions.length === 0) return null;

  return (
    <nav aria-label="Quick actions" className="md:hidden flex gap-2 overflow-x-auto">
      {actions.map((item, index) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.href}
            size="lg"
            variant={index === 0 ? 'default' : 'outline'}
            className="h-11 shrink-0"
            asChild
          >
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
