import 'server-only';
import { getDb } from '@/lib/mongo';
import type {
  MessParty,
  MessPartyCharge,
  MessPartyCostLine,
  MessPartyGuest,
  PartyBudgetStatus,
  PartyCostCategory,
  PartyCostFunding,
} from './types';

function mapParty(row: any): MessParty {
  return {
    id: String(row.id),
    unit_id: String(row.unit_id),
    title: String(row.title),
    party_date: String(row.party_date),
    venue: row.venue ?? null,
    party_type: (row.party_type as 'mess' | 'individual') ?? 'mess',
    host_profile_id: row.host_profile_id ? String(row.host_profile_id) : null,
    notes: row.notes ?? null,
    status: (row.status as 'scheduled' | 'completed' | 'cancelled') ?? 'scheduled',
    expected_headcount: row.expected_headcount != null ? Number(row.expected_headcount) : null,
    budget_amount: Number(row.budget_amount ?? 0),
    budget_status: (row.budget_status as PartyBudgetStatus) ?? 'draft',
    ration_cost: Number(row.ration_cost ?? 0),
    bar_cost: Number(row.bar_cost ?? 0),
    catering_cost: Number(row.catering_cost ?? 0),
    approved_at: row.approved_at ? String(row.approved_at) : null,
    finalized_at: row.finalized_at ? String(row.finalized_at) : null,
  };
}

export async function listUpcomingParties(unitId: string, fromDate: string): Promise<MessParty[]> {
  const db = await getDb();
  const docs = await db
    .collection('mess_parties')
    .find({
      unit_id: unitId,
      status: { $ne: 'cancelled' },
      party_date: { $gte: fromDate },
    })
    .sort({ party_date: 1 })
    .limit(20)
    .toArray();

  return docs.map(mapParty);
}

export async function listMyPartyCharges(unitId: string, profileId: string): Promise<MessPartyCharge[]> {
  const db = await getDb();
  const docs = await db
    .collection('mess_party_charges')
    .find({
      unit_id: unitId,
      profile_id: profileId,
    })
    .sort({ party_date: -1 })
    .limit(20)
    .toArray();

  return docs.map((row: any) => ({
    id: String(row.id),
    unit_id: String(row.unit_id),
    profile_id: String(row.profile_id),
    party_date: String(row.party_date),
    description: String(row.description),
    amount: Number(row.amount ?? 0),
    is_billed: Boolean(row.is_billed),
  }));
}

export async function listPartyGuestsByPartyIds(partyIds: string[]): Promise<MessPartyGuest[]> {
  if (partyIds.length === 0) return [];
  const db = await getDb();
  const docs = await db
    .collection('mess_party_guests')
    .find({
      party_id: { $in: partyIds },
    })
    .sort({ guest_name: 1 })
    .toArray();

  return docs.map((doc: any) => ({
    id: String(doc.id),
    party_id: String(doc.party_id),
    guest_name: String(doc.guest_name),
    notes: doc.notes ? String(doc.notes) : null,
  }));
}

export async function listPartyCostLinesByPartyIds(partyIds: string[]): Promise<MessPartyCostLine[]> {
  if (partyIds.length === 0) return [];
  const db = await getDb();
  const docs = await db
    .collection('mess_party_cost_lines')
    .find({
      party_id: { $in: partyIds },
    })
    .sort({ category: 1 })
    .toArray();

  return docs.map((row: any) => ({
    id: String(row.id),
    party_id: String(row.party_id),
    unit_id: String(row.unit_id),
    category: (row.category as PartyCostCategory) ?? 'other',
    funding: (row.funding as PartyCostFunding) ?? 'mess',
    description: String(row.description),
    amount: Number(row.amount ?? 0),
  }));
}
