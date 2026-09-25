import 'server-only';
import { getCollection } from '@/lib/mongo';

export interface AuditEntry {
  table_name: string;
  row_pk: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_at?: string;
  changed_by?: string | null;
  active_unit_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  diff?: Record<string, unknown> | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const payload = {
    ...entry,
    changed_at: entry.changed_at || new Date().toISOString(),
  };

  try {
    const col = await getCollection('audit_log');
    await col.insertOne({ ...payload });
  } catch (err) {
    console.error('[writeAudit] Mongo insert error:', err);
  }
}
