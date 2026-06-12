import type { Database } from '@/lib/supabase/database.types';

export type Category = Database['public']['Enums']['item_category'];

export const CATEGORY_SLUGS = ['ration', 'cold-drinks', 'alcohol', 'cigars', 'grocery', 'snacks'] as const;
export type CategorySlug = typeof CATEGORY_SLUGS[number];

const SLUG_TO_DB: Record<CategorySlug, Category> = {
  ration: 'ration',
  'cold-drinks': 'soft_drink',
  alcohol: 'alcohol',
  cigars: 'cigar',
  grocery: 'grocery',
  snacks: 'grocery',
};
const DB_TO_SLUG: Record<Category, CategorySlug> = {
  ration: 'ration',
  soft_drink: 'cold-drinks',
  alcohol: 'alcohol',
  cigar: 'cigars',
  grocery: 'grocery',
  room: 'ration',
};

export function categoryFromSlug(slug: CategorySlug): Category { return SLUG_TO_DB[slug]; }
export function slugFromCategory(cat: Category): CategorySlug { return DB_TO_SLUG[cat]; }

// The four non-ration, non-room operational categories that carry purchase
// lots in /inventory. Ration is scale-derived (lives only in the ration
// module) and `room` is guest-room-only — neither is stockable inventory.
// Reuse `CATEGORY_META` for labels; this is only the allow-list + ordering.
export const INVENTORY_CATEGORIES = [
  'alcohol',
  'soft_drink',
  'cigar',
  'grocery',
] as const satisfies readonly Category[];

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

// Pack-size kind each inventory category uses. Volume-kind categories
// (alcohol, soft_drink) measure packs in millilitres; count-kind
// categories (cigar, grocery) measure packs by a unit count. Drives the
// kind-filtered pack-size picker and the derived-serving math.
export const CATEGORY_PACK_KIND: Record<
  InventoryCategory,
  'volume' | 'count'
> = {
  alcohol: 'volume',
  soft_drink: 'volume',
  cigar: 'count',
  grocery: 'count',
};

export function isInventoryCategory(v: unknown): v is InventoryCategory {
  return (
    typeof v === 'string' &&
    (INVENTORY_CATEGORIES as readonly string[]).includes(v)
  );
}

// Categories shown in the shared /stock tab strip. Grocery is a valid
// stockable category (still in INVENTORY_CATEGORIES + isInventoryCategory)
// but now lives in its own Grocery module, so it's excluded from /stock.
export const STOCK_PAGE_CATEGORIES: readonly InventoryCategory[] =
  INVENTORY_CATEGORIES.filter((cat) => cat !== 'grocery');

export const CATEGORY_META: Record<CategorySlug, { title: string; description: string; defaultUom: Database['public']['Enums']['uom'] }> = {
  ration:        { title: 'Ration',        description: 'Issued per ration scale.',          defaultUom: 'kg' },
  'cold-drinks': { title: 'Cold Drinks',   description: 'Non-alcoholic beverages.',          defaultUom: 'bottle' },
  alcohol:       { title: 'Alcohol',       description: 'Wine, spirits, beer.',              defaultUom: 'bottle' },
  cigars:        { title: 'Cigars',        description: 'Cigars and tobacco.',               defaultUom: 'piece' },
  grocery:       { title: 'Grocery',       description: 'General grocery items.',            defaultUom: 'piece' },
  snacks:        { title: 'Snacks',        description: 'Snacks and quick bites.',           defaultUom: 'piece' },
};

