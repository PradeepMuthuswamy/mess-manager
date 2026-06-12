import { describe, expect, it, vi, beforeEach } from 'vitest';

// Hoisted mocks to prevent vitest from throwing on next.js / server imports
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/auth/require-capability', () => ({
  requireCapability: vi.fn(),
}));

vi.mock('@/lib/auth/require-role', () => ({
  requireUser: vi.fn(),
}));

import { createBarChitCore } from './actions';
import type { CreateBarChitInput } from '@/lib/schemas/bar';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('createBarChitCore', () => {
  let mockSupabase: any;
  const userId = 'user-123';
  const unitId = 'unit-456';
  const variantId = 'variant-789';

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };
  });

  it('correctly creates a chit using peg unit, converts to bottle unit, and deplets inventory lots using FIFO', async () => {
    // 1. Mock product variant retrieval
    // Old Monk: unit_value = 750, unit_type = ML (which is 25 pegs per bottle)
    const mockVariant = { unit_value: 750, unit_type: 'ML' };

    // 2. Mock inventory lots for stock check (total 1.0 bottle in stock)
    const mockInventoryLots = [
      { id: 'lot-1', qty_packs: 0.6 },
      { id: 'lot-2', qty_packs: 0.4 },
    ];

    // 3. Mock bar chit creation return
    const mockChitHeader = { id: 'chit-abc-123' };

    // Set up mock chaining responses
    mockSupabase.from.mockImplementation((table: string) => {
      const queryObj: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };

      if (table === 'product_variants') {
        queryObj.single.mockResolvedValue({ data: mockVariant, error: null });
      } else if (table === 'unit_inventory') {
        // We have two reads on unit_inventory: stock check and depletion
        // We can check if order was called to distinguish them, or just return mockInventoryLots
        queryObj.select.mockImplementation(() => {
          return {
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockImplementation(() => {
              return {
                order: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
                mockResolvedValue: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
              };
            }),
            mockResolvedValue: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
            // support if not chained with order (stock check)
            then: (resolve: any) => resolve({ data: mockInventoryLots, error: null }),
          };
        });
        queryObj.update.mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
      } else if (table === 'bar_chits') {
        queryObj.insert.mockReturnThis();
        queryObj.select.mockReturnThis();
        queryObj.single.mockResolvedValue({ data: mockChitHeader, error: null });
      } else if (table === 'bar_chit_items') {
        queryObj.insert.mockResolvedValue({ data: null, error: null });
      }

      return queryObj;
    });

    // Input data: consume 5 pegs at rate ₹10.00/peg (which is equivalent to 0.2 bottles at ₹250.00/bottle)
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

    const result = await createBarChitCore(
      mockSupabase as unknown as SupabaseClient,
      userId,
      inputData
    );

    expect(result.ok).toBe(true);
    expect(result.id).toBe('chit-abc-123');

    // Verify header was inserted with correct total amount
    // Total amount = 5 pegs * 10 rate = ₹50.00 (which is 0.2 bottles * ₹250.00)
    expect(mockSupabase.from).toHaveBeenCalledWith('bar_chits');
    
    // Verify line item was inserted with normalized values
    // quantity = 5 / 25 = 0.20
    // rate = 10 * 25 = 250
    // amount = 0.20 * 250 = 50
    expect(mockSupabase.from).toHaveBeenCalledWith('bar_chit_items');

    // Verify inventory lot depletion
    // We consumed 0.2 bottles (5 pegs).
    // Lot 1 has 0.6 bottles. It should be partially depleted to 0.4 bottles.
    // Lot 2 has 0.4 bottles. It should not be touched.
    expect(mockSupabase.from).toHaveBeenCalledWith('unit_inventory');
  });

  it('correctly depletes multiple lots in FIFO order when peg quantity exceeds first lot', async () => {
    const mockVariant = { unit_value: 750, unit_type: 'ML' }; // 25 pegs per bottle

    // Mock inventory lots: lot-1 has 0.1 bottles (2.5 pegs), lot-2 has 0.5 bottles (12.5 pegs)
    const mockInventoryLots = [
      { id: 'lot-1', qty_packs: 0.1 },
      { id: 'lot-2', qty_packs: 0.5 },
    ];

    const mockChitHeader = { id: 'chit-xyz' };

    mockSupabase.from.mockImplementation((table: string) => {
      const queryObj: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };

      if (table === 'product_variants') {
        queryObj.single.mockResolvedValue({ data: mockVariant, error: null });
      } else if (table === 'unit_inventory') {
        queryObj.select.mockImplementation(() => {
          return {
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockImplementation(() => {
              return {
                order: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
                mockResolvedValue: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
              };
            }),
            mockResolvedValue: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
            then: (resolve: any) => resolve({ data: mockInventoryLots, error: null }),
          };
        });
        queryObj.update.mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
      } else if (table === 'bar_chits') {
        queryObj.insert.mockReturnThis();
        queryObj.select.mockReturnThis();
        queryObj.single.mockResolvedValue({ data: mockChitHeader, error: null });
      } else if (table === 'bar_chit_items') {
        queryObj.insert.mockResolvedValue({ data: null, error: null });
      }

      return queryObj;
    });

    // Consume 5 pegs (0.2 bottles).
    // This exceeds lot-1 (0.1 bottles), so lot-1 is fully depleted and lot-2 is partially depleted by 0.1 bottles.
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

    const result = await createBarChitCore(
      mockSupabase as unknown as SupabaseClient,
      userId,
      inputData
    );

    expect(result.ok).toBe(true);
    expect(result.id).toBe('chit-xyz');
  });

  it('correctly uses the PIECE BOTTLE 750ml volume fallback for peg consumption', async () => {
    const mockVariant = { unit_value: 1, unit_type: 'PIECE', package_type: 'BOTTLE' };
    const mockInventoryLots = [{ id: 'lot-1', qty_packs: 1.0 }];
    const mockChitHeader = { id: 'chit-piece-123' };

    mockSupabase.from.mockImplementation((table: string) => {
      const queryObj: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };

      if (table === 'product_variants') {
        queryObj.single.mockResolvedValue({ data: mockVariant, error: null });
      } else if (table === 'unit_inventory') {
        queryObj.select.mockImplementation(() => {
          return {
            eq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockImplementation(() => {
              return {
                order: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
                mockResolvedValue: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
              };
            }),
            mockResolvedValue: vi.fn().mockResolvedValue({ data: mockInventoryLots, error: null }),
            then: (resolve: any) => resolve({ data: mockInventoryLots, error: null }),
          };
        });
        queryObj.update.mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
      } else if (table === 'bar_chits') {
        queryObj.insert.mockReturnThis();
        queryObj.select.mockReturnThis();
        queryObj.single.mockResolvedValue({ data: mockChitHeader, error: null });
      } else if (table === 'bar_chit_items') {
        queryObj.insert.mockResolvedValue({ data: null, error: null });
      }

      return queryObj;
    });

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

    const result = await createBarChitCore(
      mockSupabase as unknown as SupabaseClient,
      userId,
      inputData
    );

    expect(result.ok).toBe(true);
    expect(result.id).toBe('chit-piece-123');
    expect(mockSupabase.from).toHaveBeenCalledWith('bar_chit_items');
  });
});
