import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MessParty, MessPartyCharge, MessPartyCostLine, MessPartyGuest } from './types';

const PARTY_COLUMNS =
  'id, unit_id, title, party_date, venue, party_type, host_profile_id, notes, status, expected_headcount, budget_amount, budget_status, ration_cost, bar_cost, catering_cost, approved_at, finalized_at';

/** Generated `Database` types still describe the pre-lifecycle `mess_parties` columns. */
const PARTY_COLUMNS_TYPED =
  'id, unit_id, title, party_date, venue, party_type, host_profile_id, notes, status' as const;

type PendingTableQuery = {
  select: (columns: string) => PendingTableQuery;
  eq: (column: string, value: string) => PendingTableQuery;
  in: (column: string, values: string[]) => PendingTableQuery;
  order: (
    column: string,
    options?: { ascending?: boolean },
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

function mapParty(row: MessParty): MessParty {
  return {
    ...row,
    expected_headcount: row.expected_headcount ?? null,
    budget_amount: Number(row.budget_amount ?? 0),
    ration_cost: Number(row.ration_cost ?? 0),
    bar_cost: Number(row.bar_cost ?? 0),
    catering_cost: Number(row.catering_cost ?? 0),
  };
}

/** Guest / cost-line tables ship in 20260910150000; generated Database types lag. */
function fromPendingTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'mess_party_guests' | 'mess_party_cost_lines',
): PendingTableQuery {
  return supabase.from(table as 'mess_parties') as unknown as PendingTableQuery;
}

export async function listUpcomingParties(unitId: string, fromDate: string): Promise<MessParty[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_parties')
    .select(PARTY_COLUMNS as typeof PARTY_COLUMNS_TYPED)
    .eq('unit_id', unitId)
    .neq('status', 'cancelled')
    .gte('party_date', fromDate)
    .order('party_date', { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as MessParty[]).map(mapParty);
}

export async function listMyPartyCharges(unitId: string, profileId: string): Promise<MessPartyCharge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_party_charges')
    .select('id, unit_id, profile_id, party_date, description, amount, is_billed')
    .eq('unit_id', unitId)
    .eq('profile_id', profileId)
    .order('party_date', { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return ((data ?? []) as MessPartyCharge[]).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}

export async function getParty(id: string): Promise<MessParty | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_parties')
    .select(PARTY_COLUMNS as typeof PARTY_COLUMNS_TYPED)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapParty(data as unknown as MessParty) : null;
}

export async function listPartyGuests(partyId: string): Promise<MessPartyGuest[]> {
  const rows = await listPartyGuestsByPartyIds([partyId]);
  return rows;
}

export async function listPartyGuestsByPartyIds(partyIds: string[]): Promise<MessPartyGuest[]> {
  if (partyIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await fromPendingTable(supabase, 'mess_party_guests')
    .select('id, party_id, guest_name, notes')
    .in('party_id', partyIds)
    .order('guest_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as MessPartyGuest[];
}

export async function listPartyCostLines(partyId: string): Promise<MessPartyCostLine[]> {
  const rows = await listPartyCostLinesByPartyIds([partyId]);
  return rows;
}

export async function listPartyCostLinesByPartyIds(partyIds: string[]): Promise<MessPartyCostLine[]> {
  if (partyIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await fromPendingTable(supabase, 'mess_party_cost_lines')
    .select('id, party_id, unit_id, category, funding, description, amount')
    .in('party_id', partyIds)
    .order('category', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as MessPartyCostLine[]).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
}
