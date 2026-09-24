export interface Unit {
  id: string; // UUID
  name: string;
  code: string;
  slug: string;
  mess_type: string;
  terrain_type: string;
  catering_type: string;
  settings: Record<string, any>;
  check_in_tariff?: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Supplementary fields for platform UI compatibility
  description?: string | null;
  terrain?: string | null;
  enabled_modules?: string[] | null;
  bill_format_template?: string | null;
  room_bill_format_template?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export type UnitRow = Unit;

export type UnitSwitcherOption = {
  id: string;
  name: string;
  code: string;
};

export type UnitWithUserCount = Unit & {
  user_count: number;
};

export type UnitHubTab = 'overview' | 'users' | 'settings';
