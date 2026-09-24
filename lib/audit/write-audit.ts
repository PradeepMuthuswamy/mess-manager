import 'server-only';
import { getCollection } from '@/lib/mongo';
import { createClient as createServiceClient } from '@/lib/supabase/service';

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

  // 1. Insert into MongoDB audit_log collection
  try {
    const col = await getCollection('audit_log');
    await col.insertOne({ ...payload });
  } catch (err) {
    console.error('[writeAudit] Mongo insert error:', err);
  }

  // 2. Until Audit phase (phase 10), dual-insert into Postgres audit_log so /admin/audit keeps working
  try {
    const supabase = createServiceClient();
    await supabase.from('audit_log').insert({
      table_name: payload.table_name,
      row_pk: payload.row_pk,
      op: payload.op,
      changed_at: payload.changed_at,
      changed_by: payload.changed_by ?? null,
      active_unit_id: payload.active_unit_id ?? null,
      old_data: (payload.old_data as any) ?? null,
      new_data: (payload.new_data as any) ?? null,
      diff: (payload.diff as any) ?? null,
    });
  } catch (err) {
    console.error('[writeAudit] Postgres insert error:', err);
  }
}
