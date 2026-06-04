// Client-safe shapes for the attendance feature. queries.ts is `server-only`;
// importing a type from it still pulls the module into the client bundle, so
// shared shapes live here with no server-only marker / runtime deps.

import type { AttendanceStatus, PersonType } from '@/lib/schemas/attendance';

export type { AttendanceStatus, PersonType };

export type RosterMember = {
  person_type: PersonType;
  person_id: string;
  name: string;
  /** dependant relation, null for serving members */
  relation: 'spouse' | 'child' | 'parent' | null;
  /** sponsoring profile name, null for serving members */
  sponsor_name: string | null;
};

export type AttendanceMember = RosterMember & {
  present: boolean;
  reason: string | null;
};

export type AttendanceDayView = {
  unit_id: string;
  date: string;
  status: AttendanceStatus;
  members: AttendanceMember[];
  present_count: number;
  total: number;
};

export type DiningCandidate = {
  person_type: PersonType;
  person_id: string;
  name: string;
  relation: 'spouse' | 'child' | 'parent' | null;
  sponsor_name: string | null;
  dining_in: boolean;
};

export type MonthlyAttendanceDay = {
  date: string;
  present_count: number;
  status: AttendanceStatus;
};

export type MonthlyAttendance = {
  /** YYYY-MM */
  month: string;
  roster_total: number;
  /** keyed by date string for quick lookup */
  days: Record<string, MonthlyAttendanceDay>;
  recorded_days: number;
  average_present: number | null;
};
