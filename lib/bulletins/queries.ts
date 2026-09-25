import 'server-only';
import { getDb } from '@/lib/mongo';
import type { UnitBulletin } from './types';

export async function listUnitBulletins(unitId: string, limit = 20): Promise<UnitBulletin[]> {
  const db = await getDb();
  const docs = await db
    .collection('unit_bulletins')
    .find({ unit_id: unitId })
    .sort({ published_at: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc: any) => ({
    id: String(doc.id),
    unit_id: String(doc.unit_id),
    title: String(doc.title),
    body: String(doc.body),
    published_at: String(doc.published_at),
    created_by: doc.created_by ? String(doc.created_by) : null,
  }));
}
