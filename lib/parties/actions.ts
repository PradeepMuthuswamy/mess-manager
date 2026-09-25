'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import { requireUser } from '@/lib/auth/require-role';
import { requireCapability } from '@/lib/auth/require-capability';
import { userHasCapability } from '@/lib/auth/capabilities';
import {
  addPartyCostLineSchema,
  addPartyGuestSchema,
  approvePartyBudgetSchema,
  finalizePartySchema,
  partySchema,
  submitPartyBudgetSchema,
} from '@/lib/schemas/parties';
import type { AuthUser } from '@/lib/auth/types';
import type { Db } from 'mongodb';

type ActionResult = { ok: true } | { error: string };

type PartyRow = {
  id: string;
  unit_id: string;
  title: string;
  party_date: string;
  party_type: string;
  host_profile_id: string | null;
  status: string;
  budget_status: string;
};

function isUserUnit(user: AuthUser, unitId: string) {
  return unitId === user.homeUnitId || unitId === user.activeUnitId;
}

function revalidatePartySurfaces() {
  revalidatePath('/party');
  revalidatePath('/billing');
  revalidatePath('/dashboard');
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function canApprovePartyBudget(user: AuthUser, unitId: string): boolean {
  if (userHasCapability(user, 'billing.finalize', unitId)) return true;
  const isCommittee =
    user.role === 'unit_admin' || user.role === 'mess_secretary';
  return isCommittee && userHasCapability(user, 'parties.write', unitId);
}

function canFinalizeParty(user: AuthUser, unitId: string): boolean {
  return (
    userHasCapability(user, 'parties.finalize', unitId) ||
    userHasCapability(user, 'billing.draft', unitId)
  );
}

function asParty(row: Record<string, unknown> | null): PartyRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    unit_id: String(row.unit_id),
    title: String(row.title),
    party_date: String(row.party_date),
    party_type: String(row.party_type),
    host_profile_id: row.host_profile_id == null ? null : String(row.host_profile_id),
    status: String(row.status),
    budget_status: String(row.budget_status ?? 'draft'),
  };
}

async function loadParty(
  partyId: string,
): Promise<{ ok: true; party: PartyRow } | { ok: false; error: string }> {
  const db = await getDb();
  const data = await db.collection('mess_parties').findOne({ id: partyId });
  if (!data) return { ok: false, error: 'Party not found.' };
  const party = asParty(data as unknown as Record<string, unknown>);
  if (!party) return { ok: false, error: 'Party not found.' };
  return { ok: true, party };
}

async function requireOwnedParty(
  partyId: string,
): Promise<{ ok: true; user: AuthUser; party: PartyRow } | { ok: false; error: string }> {
  const user = await requireUser();
  const loaded = await loadParty(partyId);
  if (!loaded.ok) return loaded;
  if (!isUserUnit(user, loaded.party.unit_id)) {
    return { ok: false, error: 'You cannot act on a party in another unit.' };
  }
  return { ok: true, user, party: loaded.party };
}

export async function createPartyAction(input: unknown): Promise<ActionResult> {
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) return { error: 'Check the party date and title.' };

  const user = await requireUser();
  if (!isUserUnit(user, parsed.data.unit_id)) {
    return { error: 'You cannot create a party for another unit.' };
  }

  // unit_admin / mess_secretary already pass parties.write via requireCapability.
  await requireCapability('parties.write', parsed.data.unit_id);

  const hostProfileId =
    parsed.data.party_type === 'individual'
      ? (parsed.data.host_profile_id ?? user.id)
      : null;

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const partyDoc = {
    id,
    unit_id: parsed.data.unit_id,
    title: parsed.data.title,
    party_date: parsed.data.party_date,
    venue: parsed.data.venue ?? null,
    party_type: parsed.data.party_type,
    host_profile_id: hostProfileId,
    expected_headcount: parsed.data.expected_headcount ?? null,
    budget_amount: parsed.data.budget_amount ?? 0,
    budget_status: 'draft',
    status: 'scheduled',
    notes: parsed.data.notes ?? null,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  };

  await db.collection('mess_parties').insertOne(partyDoc);

  await writeAudit({
    table_name: 'mess_parties',
    row_pk: id,
    op: 'INSERT',
    changed_by: user.id,
    active_unit_id: parsed.data.unit_id,
    new_data: partyDoc,
  });

  revalidatePartySurfaces();
  return { ok: true };
}

export async function submitPartyBudgetAction(input: unknown): Promise<ActionResult> {
  const parsed = submitPartyBudgetSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid party budget request.' };

  const owned = await requireOwnedParty(parsed.data.party_id);
  if (!owned.ok) return { error: owned.error };

  await requireCapability('parties.write', owned.party.unit_id);

  if (owned.party.status !== 'scheduled') {
    return { error: 'Only a scheduled party can submit a budget.' };
  }
  if (owned.party.budget_status === 'approved') {
    return { error: 'This budget is already approved.' };
  }
  if (owned.party.budget_status === 'submitted') {
    return { error: 'This budget is already submitted for approval.' };
  }

  const patch: Record<string, unknown> = { budget_status: 'submitted' };
  if (parsed.data.budget_amount != null) {
    patch.budget_amount = parsed.data.budget_amount;
  }
  const now = new Date().toISOString();
  patch.updated_at = now;

  const db = await getDb();
  await db.collection('mess_parties').updateOne(
    { id: owned.party.id, unit_id: owned.party.unit_id },
    { $set: patch },
  );

  await writeAudit({
    table_name: 'mess_parties',
    row_pk: owned.party.id,
    op: 'UPDATE',
    changed_by: owned.user.id,
    active_unit_id: owned.party.unit_id,
    new_data: patch,
  });

  revalidatePartySurfaces();
  return { ok: true };
}

export async function approvePartyBudgetAction(input: unknown): Promise<ActionResult> {
  const parsed = approvePartyBudgetSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid party approval request.' };

  const owned = await requireOwnedParty(parsed.data.party_id);
  if (!owned.ok) return { error: owned.error };

  if (!canApprovePartyBudget(owned.user, owned.party.unit_id)) {
    return { error: 'Only the Mess Secretary, unit admin, or billing finaliser can approve a party budget.' };
  }

  if (owned.party.status !== 'scheduled') {
    return { error: 'Only a scheduled party can have its budget approved.' };
  }
  if (owned.party.budget_status !== 'submitted') {
    return { error: 'Submit the budget before approving it.' };
  }

  const now = new Date().toISOString();
  const patch = {
    budget_status: 'approved',
    approved_at: now,
    approved_by: owned.user.id,
    updated_at: now,
  };

  const db = await getDb();
  const res = await db.collection('mess_parties').updateOne(
    {
      id: owned.party.id,
      unit_id: owned.party.unit_id,
      budget_status: 'submitted',
    },
    { $set: patch },
  );

  if (res.matchedCount === 0) {
    return { error: 'Party budget could not be approved.' };
  }

  await writeAudit({
    table_name: 'mess_parties',
    row_pk: owned.party.id,
    op: 'UPDATE',
    changed_by: owned.user.id,
    active_unit_id: owned.party.unit_id,
    new_data: patch,
  });

  revalidatePartySurfaces();
  return { ok: true };
}

export async function addPartyGuestAction(input: unknown): Promise<ActionResult> {
  const parsed = addPartyGuestSchema.safeParse(input);
  if (!parsed.success) return { error: 'Guest name is required.' };

  const owned = await requireOwnedParty(parsed.data.party_id);
  if (!owned.ok) return { error: owned.error };

  await requireCapability('parties.write', owned.party.unit_id);

  if (owned.party.status !== 'scheduled') {
    return { error: 'Guests can only be added to a scheduled party.' };
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const guestDoc = {
    id,
    party_id: owned.party.id,
    guest_name: parsed.data.guest_name,
    notes: parsed.data.notes ?? null,
    created_by: owned.user.id,
    created_at: now,
  };

  await db.collection('mess_party_guests').insertOne(guestDoc);

  await writeAudit({
    table_name: 'mess_party_guests',
    row_pk: id,
    op: 'INSERT',
    changed_by: owned.user.id,
    active_unit_id: owned.party.unit_id,
    new_data: guestDoc,
  });

  revalidatePartySurfaces();
  return { ok: true };
}

export async function addPartyCostLineAction(input: unknown): Promise<ActionResult> {
  const parsed = addPartyCostLineSchema.safeParse(input);
  if (!parsed.success) return { error: 'Check the cost line description and amount.' };

  const owned = await requireOwnedParty(parsed.data.party_id);
  if (!owned.ok) return { error: owned.error };

  await requireCapability('parties.write', owned.party.unit_id);

  if (owned.party.status !== 'scheduled') {
    return { error: 'Cost lines can only be added to a scheduled party.' };
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const costLineDoc = {
    id,
    party_id: owned.party.id,
    unit_id: owned.party.unit_id,
    category: parsed.data.category,
    funding: parsed.data.funding,
    description: parsed.data.description,
    amount: roundMoney(parsed.data.amount),
    created_by: owned.user.id,
    created_at: now,
  };

  await db.collection('mess_party_cost_lines').insertOne(costLineDoc);

  await writeAudit({
    table_name: 'mess_party_cost_lines',
    row_pk: id,
    op: 'INSERT',
    changed_by: owned.user.id,
    active_unit_id: owned.party.unit_id,
    new_data: costLineDoc,
  });

  revalidatePartySurfaces();
  return { ok: true };
}

export async function finalizePartyAction(input: unknown): Promise<ActionResult> {
  const parsed = finalizePartySchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid party finalise request.' };

  const owned = await requireOwnedParty(parsed.data.party_id);
  if (!owned.ok) return { error: owned.error };

  if (!canFinalizeParty(owned.user, owned.party.unit_id)) {
    return { error: 'You cannot finalise this party.' };
  }

  if (owned.party.status === 'completed') {
    return { error: 'This party is already completed.' };
  }
  if (owned.party.status === 'cancelled') {
    return { error: 'A cancelled party cannot be finalised.' };
  }

  const db = await getDb();
  const now = new Date().toISOString();

  if (owned.party.party_type === 'individual') {
    const hostId = owned.party.host_profile_id;
    if (!hostId) {
      return { error: 'Individual parties need a host before they can be finalised.' };
    }

    const lines = await db
      .collection('mess_party_cost_lines')
      .find({
        party_id: owned.party.id,
        unit_id: owned.party.unit_id,
      })
      .toArray();

    const hostTotal = roundMoney(
      (lines ?? [])
        .filter((line: any) => String(line.funding) === 'host')
        .reduce((sum: number, line: any) => sum + Number(line.amount ?? 0), 0),
    );

    if (hostTotal > 0) {
      const charged = await upsertHostPartyCharge({
        db,
        unitId: owned.party.unit_id,
        profileId: hostId,
        partyDate: owned.party.party_date,
        description: owned.party.title,
        amount: hostTotal,
        createdBy: owned.user.id,
      });
      if ('error' in charged) return charged;
    }
  }

  const patch = {
    status: 'completed',
    finalized_at: now,
    finalized_by: owned.user.id,
    updated_at: now,
  };

  const res = await db.collection('mess_parties').updateOne(
    {
      id: owned.party.id,
      unit_id: owned.party.unit_id,
      status: 'scheduled',
    },
    { $set: patch },
  );

  if (res.matchedCount === 0) return { error: 'Party could not be finalised.' };

  await writeAudit({
    table_name: 'mess_parties',
    row_pk: owned.party.id,
    op: 'UPDATE',
    changed_by: owned.user.id,
    active_unit_id: owned.party.unit_id,
    new_data: patch,
  });

  revalidatePartySurfaces();
  return { ok: true };
}

async function upsertHostPartyCharge(args: {
  db: Db;
  unitId: string;
  profileId: string;
  partyDate: string;
  description: string;
  amount: number;
  createdBy: string;
}): Promise<ActionResult> {
  const { db, unitId, profileId, partyDate, description, amount, createdBy } = args;

  const existing = await db.collection('mess_party_charges').findOne({
    unit_id: unitId,
    profile_id: profileId,
    party_date: partyDate,
    description,
  });

  if (existing?.is_billed) {
    return { error: 'This host charge is already on a published bill.' };
  }

  const now = new Date().toISOString();
  if (existing) {
    await db.collection('mess_party_charges').updateOne(
      { id: existing.id, is_billed: { $ne: true } },
      { $set: { amount, updated_at: now } },
    );
    await writeAudit({
      table_name: 'mess_party_charges',
      row_pk: String(existing.id),
      op: 'UPDATE',
      changed_by: createdBy,
      active_unit_id: unitId,
      new_data: { amount, updated_at: now },
    });
    return { ok: true };
  }

  const id = crypto.randomUUID();
  const chargeDoc = {
    id,
    unit_id: unitId,
    profile_id: profileId,
    party_date: partyDate,
    description,
    amount,
    is_billed: false,
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };

  await db.collection('mess_party_charges').insertOne(chargeDoc);

  await writeAudit({
    table_name: 'mess_party_charges',
    row_pk: id,
    op: 'INSERT',
    changed_by: createdBy,
    active_unit_id: unitId,
    new_data: chargeDoc,
  });

  return { ok: true };
}
