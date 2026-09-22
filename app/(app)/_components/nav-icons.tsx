import {
  BarChart3,
  BedDouble,
  Boxes,
  CalendarCheck,
  CalendarDays,
  Circle,
  ClipboardList,
  LayoutDashboard,
  Martini,
  Megaphone,
  PackageOpen,
  PartyPopper,
  ReceiptText,
  Scissors,
  Settings,
  ShoppingBasket,
  Users,
} from 'lucide-react';

/** Named icons so the sidebar never barrels the whole lucide package. */
export function NavIcon({ name }: { name: string }) {
  switch (name) {
    case 'BarChart3':
      return <BarChart3 className="size-4 shrink-0" />;
    case 'BedDouble':
      return <BedDouble className="size-4 shrink-0" />;
    case 'Boxes':
      return <Boxes className="size-4 shrink-0" />;
    case 'CalendarCheck':
      return <CalendarCheck className="size-4 shrink-0" />;
    case 'CalendarDays':
      return <CalendarDays className="size-4 shrink-0" />;
    case 'ClipboardList':
      return <ClipboardList className="size-4 shrink-0" />;
    case 'LayoutDashboard':
      return <LayoutDashboard className="size-4 shrink-0" />;
    case 'Martini':
      return <Martini className="size-4 shrink-0" />;
    case 'Megaphone':
      return <Megaphone className="size-4 shrink-0" />;
    case 'PackageOpen':
      return <PackageOpen className="size-4 shrink-0" />;
    case 'PartyPopper':
      return <PartyPopper className="size-4 shrink-0" />;
    case 'ReceiptText':
      return <ReceiptText className="size-4 shrink-0" />;
    case 'Scissors':
      return <Scissors className="size-4 shrink-0" />;
    case 'Settings':
      return <Settings className="size-4 shrink-0" />;
    case 'ShoppingBasket':
      return <ShoppingBasket className="size-4 shrink-0" />;
    case 'Users':
      return <Users className="size-4 shrink-0" />;
    default:
      return <Circle className="size-4 shrink-0" />;
  }
}
