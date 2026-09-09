import type { HostProfile, UnitGuestTariff } from '@/lib/guest-rooms/types';

export const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function lineTotal(item: {
  amount: number | string;
  quantity: number | string;
}) {
  return Number(item.amount) * Number(item.quantity);
}

export function rootBillItems<T extends { order_id?: string | null }>(
  items: T[],
) {
  return items.filter((item) => !item.order_id);
}

export function partitionFolioItems<
  T extends {
    id: string;
    category: string;
    meal_type?: string | null;
    order_id?: string | null;
  },
>(items: T[]) {
  const root = rootBillItems(items);
  const rent = root.find((item) => item.category === 'room_rent') ?? null;
  const food =
    root.find((item) => item.category === 'food' && item.meal_type == null) ??
    null;
  const bar = root.filter((item) => item.category === 'bar');
  const other = root.filter(
    (item) =>
      item.id !== rent?.id && item.id !== food?.id && item.category !== 'bar',
  );
  return { root, rent, food, bar, other };
}

export function folioTotal<
  T extends {
    amount: number | string;
    quantity: number | string;
    order_id?: string | null;
  },
>(
  items: T[],
  orders: { items?: T[] }[] = [],
) {
  const root = rootBillItems(items);
  return (
    root.reduce((sum, item) => sum + lineTotal(item), 0) +
    orders.reduce(
      (sum, order) =>
        sum + (order.items ?? []).reduce((acc, item) => acc + lineTotal(item), 0),
      0,
    )
  );
}

export function categoryLabel(category: string) {
  if (category === 'bar') return 'Bar';
  if (category === 'room_rent') return 'Room rent';
  if (category === 'food') return 'Food';
  return category.replaceAll('_', ' ');
}

export function settlementLabel(type?: string | null) {
  return type === 'CHARGE_TO_HOST'
    ? 'Charge to host'
    : 'Direct settlement';
}

export function formatHost(host?: HostProfile | null) {
  if (!host) return null;
  const name = `${host.rank ? `${host.rank} ` : ''}${host.full_name ?? ''}`.trim();
  if (!name) return host.service_no ? `(${host.service_no})` : null;
  return host.service_no ? `${name} (${host.service_no})` : name;
}

export function resolveGuestFoodPerNight(
  explicit?: number,
  unit?: UnitGuestTariff | null,
) {
  if (explicit != null) return explicit;
  if (unit?.guest_food_per_night == null) return undefined;
  return Number(unit.guest_food_per_night);
}
