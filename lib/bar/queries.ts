import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import {
  BAR_CATEGORIES,
  type BarCatalogItem,
  type BarChitRow,
  type BarInventoryLot,
} from '@/lib/bar/types';

export type { BarCatalogItem, BarChitRow, BarInventoryLot } from '@/lib/bar/types';

type CatalogAdoption = {
  variant_id: string;
  local_sku: string | null;
};

async function listAdoptedVariantIds(
  supabase: SupabaseClient<Database>,
  unitId: string,
): Promise<CatalogAdoption[]> {
  const { data, error } = await supabase
    .from('unit_catalog')
    .select('variant_id, local_sku')
    .eq('unit_id', unitId)
    .eq('is_enabled', true);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Latest unit_menu_rates.rate per variant where effective_from <= asOfDate. */
async function loadLatestMenuRates(
  supabase: SupabaseClient<Database>,
  unitId: string,
  variantIds: string[],
  asOfDate: string,
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  if (variantIds.length === 0) return rates;

  const { data, error } = await supabase
    .from('unit_menu_rates')
    .select('variant_id, rate, effective_from')
    .eq('unit_id', unitId)
    .in('variant_id', variantIds)
    .lte('effective_from', asOfDate)
    .order('effective_from', { ascending: false });

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    if (!rates.has(row.variant_id)) {
      rates.set(row.variant_id, Number(row.rate));
    }
  }
  return rates;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function getBarInventory(unitId: string): Promise<BarInventoryLot[]> {
  const supabase = await createClient();
  const adopted = await listAdoptedVariantIds(supabase, unitId);
  const variantIds = adopted.map((row) => row.variant_id);
  if (variantIds.length === 0) return [];

  const { data, error } = await supabase
    .from('v_unit_inventory_current')
    .select('*')
    .eq('unit_id', unitId)
    .in('item_id', variantIds)
    .in('category', BAR_CATEGORIES)
    .eq('is_active', true)
    .gt('qty_packs', 0)
    .order('item_name');

  if (error) throw new Error(error.message);

  const menuRates = await loadLatestMenuRates(supabase, unitId, variantIds, todayIsoDate());
  return (data ?? []).map((lot) => {
    const menuRate = lot.item_id ? menuRates.get(lot.item_id) ?? null : null;
    return {
      ...lot,
      // Overlay committee sale rate so the existing chit UI charges menu, not lot cost.
      rate: menuRate ?? lot.rate,
      menu_rate: menuRate,
    };
  });
}

export async function listAdoptedBarItems(
  unitId: string,
  q?: string,
): Promise<BarCatalogItem[]> {
  const supabase = await createClient();
  const adopted = await listAdoptedVariantIds(supabase, unitId);
  if (adopted.length === 0) return [];

  const localSkuByVariant = new Map(adopted.map((row) => [row.variant_id, row.local_sku]));
  const variantIds = adopted.map((row) => row.variant_id);

  let itemsQuery = supabase
    .from('v_items_current')
    .select('id, name, sku, category, pack_label, volume_ml, is_active')
    .in('id', variantIds)
    .in('category', BAR_CATEGORIES)
    .eq('is_active', true)
    .order('name');

  const qClean = q?.trim();
  if (qClean) {
    itemsQuery = itemsQuery.ilike('name', `%${qClean}%`);
  }

  const { data, error } = await itemsQuery;
  if (error) throw new Error(error.message);

  const matchedIds = (data ?? []).map((row) => row.id).filter((id): id is string => id != null);
  const menuRates = await loadLatestMenuRates(supabase, unitId, matchedIds, todayIsoDate());

  return (data ?? []).flatMap((row) => {
    if (!row.id || !row.name) return [];
    return [{
      variant_id: row.id,
      name: row.name,
      sku: row.sku,
      local_sku: localSkuByVariant.get(row.id) ?? null,
      category: row.category,
      pack_label: row.pack_label,
      volume_ml: row.volume_ml == null ? null : Number(row.volume_ml),
      menu_rate: menuRates.get(row.id) ?? null,
    }];
  });
}

export async function searchBarItems(unitId: string, q: string): Promise<BarCatalogItem[]> {
  return listAdoptedBarItems(unitId, q);
}

export async function listBarChits(unitId: string): Promise<BarChitRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bar_chits')
    .select(`
      *,
      profile:profile_id (id, full_name, email, rank, service_no),
      booking:booking_id (
        id,
        guest_name,
        room:room_id (name)
      ),
      items:bar_chit_items (
        *,
        variant:variant_id (
          id,
          unit_value,
          unit_type,
          package_type,
          product:product_id (name)
        )
      )
    `)
    .eq('unit_id', unitId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as unknown as BarChitRow[];
}

export async function listUnitMembers(unitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, rank, service_no')
    .eq('unit_id', unitId)
    .eq('is_active', true)
    .order('full_name');

  if (error) throw new Error(error.message);
  return data;
}

export async function listActiveBookings(unitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      guest_name,
      guest_rank,
      status,
      room:room_id (name)
    `)
    .eq('unit_id', unitId)
    .in('status', ['confirmed', 'checked_in'])
    .order('guest_name');

  if (error) throw new Error(error.message);
  
  return (data ?? []).map((b) => ({
    id: b.id,
    guest_name: b.guest_name,
    guest_rank: b.guest_rank,
    status: b.status ?? 'confirmed',
    room_name: (b.room as unknown as { name: string } | null)?.name ?? 'Unknown Room',
  }));
}
