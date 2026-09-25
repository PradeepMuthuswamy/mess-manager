import type { Role, Capability } from '@/lib/auth/types';

export type Relation = 'spouse' | 'child' | 'parent';

export interface UserDoc {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name?: string | null;
  rank?: string | null;
  service_no?: string | null;
  role: Role;
  unit_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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

export interface DependantDoc {
  id: string;
  primary_profile_id: string;
  unit_id: string;
  full_name: string;
  relation: Relation;
  date_of_birth: string | null;
  gender: string | null;
  is_active: boolean;
  notes: string | null;
  auth_user_id?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export type DependantRow = DependantDoc;

export interface CapabilityTemplateDoc {
  id: string;
  name: string;
  description: string | null;
  capabilities: Capability[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  capabilities: Capability[];
  is_system: boolean;
  updated_at: string;
};

export interface UserCapabilityDoc {
  id?: string;
  user_id: string;
  capability: Capability;
  unit_id: string | null;
  granted_by?: string | null;
  created_at?: string;
}

export interface MemberRow {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  rank: string | null;
  service_no: string | null;
  role: Role;
  unit_id: string | null;
  is_active: boolean;
}

export type UnitOption = { id: string; name: string; code?: string };
export type TemplateOption = { id: string; name: string; description: string | null; capabilities?: Capability[] };

export type MemberWithDependants = MemberRow & { dependants: DependantRow[] };
