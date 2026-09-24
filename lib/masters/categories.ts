export type Category =
  | 'ration'
  | 'soft_drink'
  | 'alcohol'
  | 'cigar'
  | 'grocery'
  | 'room';

export type InventoryCategory = 'alcohol' | 'soft_drink' | 'cigar' | 'grocery' | 'ration';

export type Uom = 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'pack' | 'bottle';

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


export const CATEGORY_META: Record<CategorySlug, { title: string; description: string; defaultUom: Uom }> = {
  ration:        { title: 'Ration',        description: 'Issued per ration scale.',          defaultUom: 'kg' },
  'cold-drinks': { title: 'Cold Drinks',   description: 'Non-alcoholic beverages.',          defaultUom: 'bottle' },
  alcohol:       { title: 'Alcohol',       description: 'Wine, spirits, beer.',              defaultUom: 'bottle' },
  cigars:        { title: 'Cigars',        description: 'Cigars and tobacco.',               defaultUom: 'piece' },
  grocery:       { title: 'Grocery',       description: 'General grocery items.',            defaultUom: 'piece' },
  snacks:        { title: 'Snacks',        description: 'Snacks and quick bites.',           defaultUom: 'piece' },
};

