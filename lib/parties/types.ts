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
