export type PartyBudgetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type PartyCostCategory = 'ration' | 'bar' | 'catering' | 'other';
export type PartyCostFunding = 'mess' | 'host' | 'guest';

export type MessParty = {
  id: string;
  unit_id: string;
  title: string;
  party_date: string;
  venue: string | null;
  party_type: 'mess' | 'individual';
  host_profile_id: string | null;
  notes: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  expected_headcount: number | null;
  budget_amount: number;
  budget_status: PartyBudgetStatus;
  ration_cost: number;
  bar_cost: number;
  catering_cost: number;
  approved_at: string | null;
  finalized_at: string | null;
};

export type MessPartyGuest = {
  id: string;
  party_id: string;
  guest_name: string;
  notes: string | null;
};

export type MessPartyCostLine = {
  id: string;
  party_id: string;
  unit_id: string;
  category: PartyCostCategory;
  funding: PartyCostFunding;
  description: string;
  amount: number;
};

export type MessPartyCharge = {
  id: string;
  unit_id: string;
  profile_id: string;
  party_date: string;
  description: string;
  amount: number;
  is_billed: boolean;
};
