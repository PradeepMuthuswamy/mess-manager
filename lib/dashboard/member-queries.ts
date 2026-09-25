import 'server-only';
import { getCollection } from '@/lib/mongo';

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
  const col = await getCollection('bar_chits');
  const docs = await col
    .find({
      unit_id: unitId,
      profile_id: profileId,
      date: { $gte: sinceDate },
    })
    .sort({ date: -1 })
    .limit(10)
    .toArray();

  return docs.map((row: Record<string, unknown>) => ({
    id: String(row.id || row._id),
    date: String(row.date),
    status: String(row.status),
    total_amount: Number(row.total_amount ?? 0),
  }));
}
