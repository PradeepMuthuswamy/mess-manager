import 'server-only';
import { getDb } from '@/lib/mongo';
import {
  BAR_CATEGORIES,
  type BarCategory,
  type BarCatalogItem,
  type BarChitRow,
  type BarInventoryLot,
} from '@/lib/bar/types';

export type { BarCatalogItem, BarChitRow, BarInventoryLot } from '@/lib/bar/types';

type CatalogAdoption = {
  variant_id: string;
  local_sku: string | null;
};

async function listAdoptedVariantIds(unitId: string): Promise<CatalogAdoption[]> {
  const db = await getDb();
  const docs = await db
    .collection('unit_catalog')
    .find({ unit_id: unitId, is_enabled: true })
    .project({ variant_id: 1, local_sku: 1 })
    .toArray();

  return docs.map((doc: import("mongodb").Document) => ({
    variant_id: doc.variant_id,
    local_sku: doc.local_sku ?? null,
  }));
}

/** Latest unit_menu_rates.rate per variant where effective_from <= asOfDate. */
async function loadLatestMenuRates(
  unitId: string,
  variantIds: string[],
  asOfDate: string,
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  if (variantIds.length === 0) return rates;

  const db = await getDb();
  const docs = await db
    .collection('unit_menu_rates')
    .find({
      unit_id: unitId,
      variant_id: { $in: variantIds },
      effective_from: { $lte: asOfDate },
    })
    .sort({ effective_from: -1 })
    .toArray();

  for (const row of docs as import("mongodb").Document[]) {
    if (!rates.has(row.variant_id)) {
      rates.set(row.variant_id, Number(row.rate));
    }
  }
  return rates;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function resolveCategory(catDoc: import("mongodb").Document | null): BarCategory | null {
  const name = (catDoc?.name || catDoc?.slug || '').toLowerCase();
  if (name.includes('alcohol') || name.includes('beer') || name.includes('rum') || name.includes('whisky')) {
    return 'alcohol';
  }
  if (name.includes('cold') || name.includes('drink') || name.includes('soft')) {
    return 'soft_drink';
  }
  if (name.includes('cigar')) {
    return 'cigar';
  }
  if (name.includes('grocery') || name.includes('snack')) {
    return 'grocery';
  }
  return null;
}

function calculateVolumeMl(variant: import("mongodb").Document | null): number | null {
  if (!variant) return null;
  const unitValue = Number(variant.unit_value ?? 0);
  const unitType = variant.unit_type;
  const packageType = variant.package_type;

  if (unitType === 'ML') return unitValue;
  if (unitType === 'LITRE') return unitValue * 1000;
  if (unitType === 'PIECE' && packageType === 'BOTTLE') return 750;
  return null;
}

export async function getBarInventory(unitId: string): Promise<BarInventoryLot[]> {
  const adopted = await listAdoptedVariantIds(unitId);
  const variantIds = adopted.map((row) => row.variant_id);
  if (variantIds.length === 0) return [];

  const db = await getDb();
  const invCol = db.collection('unit_inventory');

  const pipeline: import("mongodb").Document[] = [
    {
      $match: {
        unit_id: unitId,
        variant_id: { $in: variantIds },
        is_active: { $ne: false },
        qty_packs: { $gt: 0 },
      },
    },
    {
      $lookup: {
        from: 'product_variants',
        localField: 'variant_id',
        foreignField: 'id',
        as: 'variant',
      },
    },
    { $unwind: { path: '$variant', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'products',
        localField: 'variant.product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category_id',
        foreignField: 'id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $sort: { 'product.name': 1 },
    },
  ];

  const lots = await invCol.aggregate(pipeline).toArray();
  const menuRates = await loadLatestMenuRates(unitId, variantIds, todayIsoDate());

  const result: BarInventoryLot[] = [];
  for (const lot of lots as import("mongodb").Document[]) {
    const category = resolveCategory(lot.category);
    if (!category || !BAR_CATEGORIES.includes(category)) {
      continue;
    }

    const menuRate = lot.variant_id ? menuRates.get(lot.variant_id) ?? null : null;
    const volumeMl = calculateVolumeMl(lot.variant);
    const packLabel = lot.variant
      ? `${lot.variant.unit_value} ${lot.variant.unit_type} ${lot.variant.package_type}`
      : null;

    result.push({
      id: lot.id,
      unit_id: lot.unit_id,
      item_id: lot.variant_id,
      item_name: lot.product?.name ?? 'Unknown Item',
      qty_packs: Number(lot.qty_packs ?? 0),
      rate: menuRate ?? Number(lot.rate ?? 0),
      pack_label: packLabel,
      category,
      volume_ml: volumeMl,
      is_active: lot.is_active ?? true,
      acquired_on: lot.acquired_on ?? null,
      created_at: lot.created_at ?? null,
      menu_rate: menuRate,
    });
  }

  return result;
}


export async function listBarChits(unitId: string): Promise<BarChitRow[]> {
  const db = await getDb();
  const chits = await db
    .collection('bar_chits')
    .find({ unit_id: unitId })
    .sort({ date: -1, created_at: -1 })
    .toArray();

  if (chits.length === 0) return [];

  const chitIds = chits.map((c: import("mongodb").Document) => c.id);
  const profileIds = chits
    .map((c: import("mongodb").Document) => c.profile_id)
    .filter((id: unknown): id is string => !!id);
  const bookingIds = chits
    .map((c: import("mongodb").Document) => c.booking_id)
    .filter((id: unknown): id is string => !!id);

  // 1. Fetch profiles
  const profiles = profileIds.length > 0
    ? await db
        .collection('profiles')
        .find({ id: { $in: profileIds } })
        .project({ id: 1, full_name: 1, email: 1, rank: 1, service_no: 1 })
        .toArray()
    : [];
  const profileMap = new Map<string, import("mongodb").Document>(profiles.map((p: import("mongodb").Document) => [p.id, p]));

  // 2. Fetch bookings with room
  let bookingMap = new Map<string, import("mongodb").Document>();
  if (bookingIds.length > 0) {
    const bookings = await db
      .collection('bookings')
      .find({ id: { $in: bookingIds } })
      .project({ id: 1, guest_name: 1, room_id: 1 })
      .toArray();

    const roomIds = bookings.map((b: import("mongodb").Document) => b.room_id).filter(Boolean);
    const rooms = roomIds.length > 0
      ? await db
          .collection('rooms')
          .find({ id: { $in: roomIds } })
          .project({ id: 1, name: 1 })
          .toArray()
      : [];
    const roomMap = new Map<string, import("mongodb").Document>(rooms.map((r: import("mongodb").Document) => [r.id, r]));

    bookingMap = new Map(
      bookings.map((b: import("mongodb").Document) => [
        b.id,
        {
          id: b.id,
          guest_name: b.guest_name,
          room: roomMap.get(b.room_id) ? { name: roomMap.get(b.room_id)!.name as string } : null,
        },
      ]),
    );
  }

  // 3. Fetch bar chit items
  const items = await db
    .collection('bar_chit_items')
    .find({ chit_id: { $in: chitIds } })
    .toArray();

  const variantIds = items.map((i: import("mongodb").Document) => i.variant_id).filter(Boolean);
  let variantMap = new Map<string, import("mongodb").Document>();
  if (variantIds.length > 0) {
    const variants = await db
      .collection('product_variants')
      .find({ id: { $in: variantIds } })
      .toArray();

    const productIds = variants.map((v: import("mongodb").Document) => v.product_id).filter(Boolean);
    const products = productIds.length > 0
      ? await db
          .collection('products')
          .find({ id: { $in: productIds } })
          .project({ id: 1, name: 1 })
          .toArray()
      : [];
    const productMap = new Map<string, import("mongodb").Document>(products.map((p: import("mongodb").Document) => [p.id, p]));

    variantMap = new Map(
      variants.map((v: import("mongodb").Document) => [
        v.id,
        {
          id: v.id,
          unit_value: Number(v.unit_value ?? 0),
          unit_type: v.unit_type,
          package_type: v.package_type,
          product: productMap.get(v.product_id) ? { name: productMap.get(v.product_id)!.name as string } : null,
        },
      ]),
    );
  }

  const itemsByChit = new Map<string, import("mongodb").Document[]>();
  for (const item of items) {
    const arr = itemsByChit.get(item.chit_id) ?? [];
    arr.push({
      id: item.id,
      chit_id: item.chit_id,
      variant_id: item.variant_id,
      quantity: Number(item.quantity ?? 0),
      rate: Number(item.rate ?? 0),
      amount: Number(item.amount ?? 0),
      created_at: item.created_at,
      variant: variantMap.get(item.variant_id) ?? null,
    });
    itemsByChit.set(item.chit_id, arr);
  }

  return chits.map((chit) => ({
    id: chit.id, // casted down below
    unit_id: chit.unit_id,
    date: chit.date,
    profile_id: chit.profile_id ?? null,
    guest_name: chit.guest_name ?? null,
    booking_id: chit.booking_id ?? null,
    total_amount: Number(chit.total_amount ?? 0),
    status: chit.status,
    created_by: chit.created_by ?? null,
    created_at: chit.created_at,
    updated_at: chit.updated_at,
    profile: chit.profile_id ? (profileMap.get(chit.profile_id) ?? null) : null,
    booking: chit.booking_id ? (bookingMap.get(chit.booking_id) ?? null) : null,
    items: itemsByChit.get(chit.id) ?? [],
  })) as unknown as BarChitRow[];
}

export async function listUnitMembers(unitId: string) {
  const db = await getDb();
  const members = await db
    .collection('profiles')
    .find({ unit_id: unitId, is_active: true })
    .project({ id: 1, full_name: 1, email: 1, rank: 1, service_no: 1 })
    .sort({ full_name: 1 })
    .toArray();

  return members.map((m: import("mongodb").Document) => ({
    id: m.id,
    full_name: m.full_name ?? null,
    email: m.email ?? null,
    rank: m.rank ?? null,
    service_no: m.service_no ?? null,
  }));
}

export async function listActiveBookings(unitId: string) {
  const db = await getDb();
  const bookings = await db
    .collection('bookings')
    .find({
      unit_id: unitId,
      status: { $in: ['confirmed', 'checked_in'] },
    })
    .sort({ guest_name: 1 })
    .toArray();

  if (bookings.length === 0) return [];

  const roomIds = bookings.map((b: import("mongodb").Document) => b.room_id).filter(Boolean);
  const rooms = roomIds.length > 0
    ? await db
        .collection('rooms')
        .find({ id: { $in: roomIds } })
        .project({ id: 1, name: 1 })
        .toArray()
    : [];
  const roomMap = new Map<string, import("mongodb").Document>(rooms.map((r: import("mongodb").Document) => [r.id, r]));

  return bookings.map((b: import("mongodb").Document) => ({
    id: b.id,
    guest_name: b.guest_name,
    guest_rank: b.guest_rank,
    status: b.status ?? 'confirmed',
    room_name: roomMap.get(b.room_id)?.name ?? 'Unknown Room',
  }));
}
