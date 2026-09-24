import type { Role, Capability } from '@/lib/auth/types';

export interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  unit_id: string | null;
  is_active: boolean;
  rank: string | null;
  service_no: string | null;
  display_name: string | null;
  updated_at: string;
  created_at?: string;
  user_capabilities?: { capability: Capability; unit_id: string | null }[];
}

export type UnitOption = { id: string; name: string; code?: string };
export type TemplateOption = { id: string; name: string; description: string | null; capabilities?: Capability[] };
