export type RoomWaitlistRequest = {
  id: string;
  unit_id: string;
  profile_id: string;
  guest_name: string;
  requested_from: string;
  requested_to: string;
  notes: string | null;
  status: 'requested' | 'offered' | 'cancelled' | 'booked';
  created_at: string;
};
