import { describe, expect, it, vi, beforeEach } from 'vitest';

// Hoisted mocks to prevent vitest from throwing on next.js / server imports
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/audit/write-audit', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/require-capability', () => ({
  requireCapability: vi.fn(),
}));

vi.mock('@/lib/auth/require-role', () => ({
  requireUser: vi.fn(),
}));

const mockDbState: {
  productVariants: Record<string, any>[];
  unitInventory: Record<string, any>[];
  barChits: Record<string, any>[];
  barChitItems: Record<string, any>[];
  unitCatalog: Record<string, any>[];
  unitMenuRates: Record<string, any>[];
} = {
  productVariants: [],
  unitInventory: [],
  barChits: [],
  barChitItems: [],
  unitCatalog: [],
  unitMenuRates: [],
};

vi.mock('@/lib/mongo', () => ({
  getDb: vi.fn().mockImplementation(async () => ({
    collection: (name: string) => {
      if (name === 'product_variants') {
        return {
          findOne: vi.fn().mockImplementation(async (query: { id?: string, unit_id?: string, variant_id?: string, is_enabled?: boolean, effective_from?: { $lte: string }, qty_packs?: { $gt: number }, is_active?: { $ne: boolean } }) => {
            return mockDbState.productVariants.find((v) => v.id === query.id) ?? null;
          }),
        };
      }
      if (name === 'unit_catalog') {
        return {
          findOne: vi.fn().mockImplementation(async (query: { id?: string, unit_id?: string, variant_id?: string, is_enabled?: boolean, effective_from?: { $lte: string }, qty_packs?: { $gt: number }, is_active?: { $ne: boolean } }) => {
            return (
              mockDbState.unitCatalog.find(
                (c) =>
                  c.unit_id === query.unit_id &&
                  c.variant_id === query.variant_id &&
                  (query.is_enabled === undefined || c.is_enabled === query.is_enabled),
              ) ?? null
            );
          }),
        };
      }
      if (name === 'unit_menu_rates') {
        return {
          find: vi.fn().mockImplementation((query: { id?: string, unit_id?: string, variant_id?: string, is_enabled?: boolean, effective_from?: { $lte: string }, qty_packs?: { $gt: number }, is_active?: { $ne: boolean } }) => {
            let matched = mockDbState.unitMenuRates.filter(
              (r) =>
                r.unit_id === query.unit_id &&
                r.variant_id === query.variant_id &&
                (!query.effective_from?.$lte || (r.effective_from as string) <= query.effective_from.$lte),
            );
            return {
              sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  next: vi.fn().mockImplementation(async () => matched[0] ?? null),
                }),
              }),
            };
          }),
        };
      }
      if (name === 'unit_inventory') {
        return {
          find: vi.fn().mockImplementation((query: { id?: string, unit_id?: string, variant_id?: string, is_enabled?: boolean, effective_from?: { $lte: string }, qty_packs?: { $gt: number }, is_active?: { $ne: boolean } }) => {
            let matched = mockDbState.unitInventory.filter((l) => {
              if (query.unit_id && l.unit_id !== query.unit_id) return false;
              if (query.variant_id && l.variant_id !== query.variant_id) return false;
              if (query.qty_packs?.$gt !== undefined && !((l.qty_packs as number) > query.qty_packs.$gt)) return false;
              if (query.is_active?.$ne !== undefined && l.is_active === query.is_active.$ne) return false;
              return true;
            });
            return {
              toArray: vi.fn().mockImplementation(async () => matched),
              sort: vi.fn().mockImplementation(() => ({
                toArray: vi.fn().mockImplementation(async () => matched),
              })),
            };
          }),
          updateOne: vi.fn().mockImplementation(async (filter: { id: string }, update: { $set: Record<string, unknown> }) => {
            const lot = mockDbState.unitInventory.find((l) => l.id === filter.id);
            if (lot && update.$set) {
              Object.assign(lot, update.$set);
            }
            return { modifiedCount: 1 };
          }),
        };
      }
      if (name === 'bar_chits') {
        return {
          insertOne: vi.fn().mockImplementation(async (doc: Record<string, unknown>) => {
            mockDbState.barChits.push(doc);
            return { insertedId: doc.id };
          }),
          deleteOne: vi.fn().mockImplementation(async (filter: Record<string, unknown>) => {
            const idx = mockDbState.barChits.findIndex((c) => c.id === filter.id);
            if (idx >= 0) mockDbState.barChits.splice(idx, 1);
            return { deletedCount: 1 };
          }),
        };
      }
      if (name === 'bar_chit_items') {
        return {
          insertOne: vi.fn().mockImplementation(async (doc: Record<string, unknown>) => {
            mockDbState.barChitItems.push(doc);
            return { insertedId: doc.id };
          }),
        };
      }
      return {};
    },
  })),
}));

import { createBarChitCore } from './actions';
import type { CreateBarChitInput } from '@/lib/schemas/bar';

describe('createBarChitCore', () => {
  const userId = 'user-123';
  const unitId = 'unit-456';
  const variantId = 'variant-789';

  beforeEach(() => {
    mockDbState.productVariants = [];
    mockDbState.unitInventory = [];
    mockDbState.barChits = [];
    mockDbState.barChitItems = [];
    mockDbState.unitCatalog = [];
    mockDbState.unitMenuRates = [];
  });

  it('correctly creates a chit using peg unit, converts to bottle unit, and depletes inventory lots using FIFO', async () => {
    mockDbState.unitCatalog = [{ unit_id: unitId, variant_id: variantId, is_enabled: true }];
    mockDbState.productVariants = [
      { id: variantId, unit_value: 750, unit_type: 'ML', package_type: 'BOTTLE' },
    ];
    mockDbState.unitInventory = [
      { id: 'lot-1', unit_id: unitId, variant_id: variantId, qty_packs: 0.6, is_active: true, acquired_on: '2026-01-01' },
      { id: 'lot-2', unit_id: unitId, variant_id: variantId, qty_packs: 0.4, is_active: true, acquired_on: '2026-01-02' },
    ];

    const inputData: CreateBarChitInput = {
      unit_id: unitId,
      date: '2026-06-05',
      consumer_type: 'member',
      profile_id: 'profile-111',
      items: [
        {
          variant_id: variantId,
          quantity: 5, // 5 pegs
          rate: 10, // ₹10 per peg
          name: 'Old Monk (1.000 PIECE BOTTLE)',
          unit: 'peg',
        },
      ],
    };

    const result = await createBarChitCore(userId, inputData);

    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();

    expect(mockDbState.barChits.length).toBe(1);
    expect(mockDbState.barChits[0].total_amount).toBe(50);

    expect(mockDbState.barChitItems.length).toBe(1);
    expect(mockDbState.barChitItems[0].quantity).toBe(0.2); // 5 pegs / 25
    expect(mockDbState.barChitItems[0].rate).toBe(250); // 10 * 25
    expect(mockDbState.barChitItems[0].amount).toBe(50);

    const lot1 = mockDbState.unitInventory.find((l) => l.id === 'lot-1');
    expect(lot1!.qty_packs).toBeCloseTo(0.4);
  });

  it('correctly depletes multiple lots in FIFO order when peg quantity exceeds first lot', async () => {
    mockDbState.unitCatalog = [{ unit_id: unitId, variant_id: variantId, is_enabled: true }];
    mockDbState.productVariants = [
      { id: variantId, unit_value: 750, unit_type: 'ML', package_type: 'BOTTLE' },
    ];
    mockDbState.unitInventory = [
      { id: 'lot-1', unit_id: unitId, variant_id: variantId, qty_packs: 0.1, is_active: true, acquired_on: '2026-01-01' },
      { id: 'lot-2', unit_id: unitId, variant_id: variantId, qty_packs: 0.5, is_active: true, acquired_on: '2026-01-02' },
    ];

    const inputData: CreateBarChitInput = {
      unit_id: unitId,
      date: '2026-06-05',
      consumer_type: 'member',
      profile_id: 'profile-111',
      items: [
        {
          variant_id: variantId,
          quantity: 5,
          rate: 10,
          name: 'Old Monk',
          unit: 'peg',
        },
      ],
    };

    const result = await createBarChitCore(userId, inputData);

    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();

    const lot1 = mockDbState.unitInventory.find((l) => l.id === 'lot-1');
    const lot2 = mockDbState.unitInventory.find((l) => l.id === 'lot-2');
    expect(lot1!.qty_packs).toBe(0);
    expect(lot1!.is_active).toBe(false);
    expect(lot2!.qty_packs).toBeCloseTo(0.4);
  });

  it('rejects a variant that is not adopted in unit_catalog', async () => {
    mockDbState.unitCatalog = [];
    mockDbState.productVariants = [
      { id: variantId, unit_value: 750, unit_type: 'ML', package_type: 'BOTTLE' },
    ];

    const result = await createBarChitCore(userId, {
      unit_id: unitId,
      date: '2026-09-10',
      consumer_type: 'member',
      profile_id: 'profile-111',
      items: [
        {
          variant_id: variantId,
          quantity: 1,
          rate: 250,
          name: 'Old Monk',
          unit: 'bottle',
        },
      ],
    });

    expect(result.ok).toBeUndefined();
    expect(result.error).toMatch(/not an adopted catalog item/i);
    expect(mockDbState.barChits.length).toBe(0);
  });

  it('rejects a zero rate when no unit_menu_rates row exists', async () => {
    mockDbState.unitCatalog = [{ unit_id: unitId, variant_id: variantId, is_enabled: true }];
    mockDbState.unitMenuRates = [];

    const result = await createBarChitCore(userId, {
      unit_id: unitId,
      date: '2026-09-10',
      consumer_type: 'member',
      profile_id: 'profile-111',
      items: [
        {
          variant_id: variantId,
          quantity: 1,
          rate: 0,
          name: 'Old Monk',
          unit: 'bottle',
        },
      ],
    });

    expect(result.ok).toBeUndefined();
    expect(result.error).toMatch(/no menu rate/i);
    expect(mockDbState.barChits.length).toBe(0);
  });
});
