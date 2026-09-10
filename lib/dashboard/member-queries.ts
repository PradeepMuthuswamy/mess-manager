import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type MemberBarChit = {
  id: string;
  date: string;
  status: string;
  total_amount: number;
};

export async function listMyBarChits(
  unitId: string,
  profileId: string,
  sinceDate: string,
): Promise<MemberBarChit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bar_chits')
    .select('id, date, status, total_amount')
    .eq('unit_id', unitId)
    .eq('profile_id', profileId)
    .gte('date', sinceDate)
    .order('date', { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    status: row.status,
    total_amount: Number(row.total_amount),
  }));
}
