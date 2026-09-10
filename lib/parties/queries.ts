import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MessParty, MessPartyCharge } from './types';

export async function listUpcomingParties(unitId: string, fromDate: string): Promise<MessParty[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_parties')
    .select('id, unit_id, title, party_date, venue, party_type, host_profile_id, notes, status')
    .eq('unit_id', unitId)
    .neq('status', 'cancelled')
    .gte('party_date', fromDate)
    .order('party_date', { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data ?? []) as MessParty[];
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
