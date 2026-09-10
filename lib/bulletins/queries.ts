import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { UnitBulletin } from './types';

export async function listUnitBulletins(unitId: string, limit = 20): Promise<UnitBulletin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('unit_bulletins')
    .select('id, unit_id, title, body, published_at, created_by')
    .eq('unit_id', unitId)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as UnitBulletin[];
}
