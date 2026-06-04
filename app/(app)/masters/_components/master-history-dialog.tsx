'use client';

import { useEffect, useState } from 'react';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { createClient } from '@/lib/supabase/client';
import type { MasterRow } from '@/lib/masters/types';

type Version = {
  id: string;
  rate: number;
  ration_scale: number | null;
  notes: string | null;
  valid_from: string;
  valid_to: string | null;
};

export function MasterHistoryDialog({
  item,
  open,
  onClose,
}: {
  item: MasterRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Version[]>([]);
  // Track which item the loaded rows belong to instead of toggling a
  // `loading` flag synchronously inside the effect (react-hooks/
  // set-state-in-effect). `loading` is derived during render.
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const sb = createClient();
    sb.from('item_versions')
      .select('id, rate, ration_scale, notes, valid_from, valid_to')
      .eq('item_id', item.id)
      .order('valid_from', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data ?? []) as Version[]);
        setLoadedId(item.id);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const loading = item != null && loadedId !== item.id;

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Version history"
      description={item?.name}
      contentClassName="sm:max-w-lg max-h-[85vh]"
    >
      <div className="space-y-2">
          {loading && (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-md border bg-muted/50 px-4 py-3 animate-pulse h-16"
                />
              ))}
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No rate history recorded yet.
            </div>
          )}

          {!loading && rows.map((v, idx) => (
            <div
              key={v.id}
              className="rounded-md border bg-card px-4 py-3 space-y-1.5"
            >
              {/* Version header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    v{rows.length - idx}
                  </span>
                  <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                    ₹{Number(v.rate).toFixed(2)}
                  </span>
                </div>
                {v.valid_to == null && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Current
                  </span>
                )}
              </div>

              {/* Ration scale (conditional) */}
              {v.ration_scale != null && (
                <div className="text-xs text-muted-foreground">
                  Scale:{' '}
                  <span className="font-mono tabular-nums">
                    {Number(v.ration_scale).toFixed(3)}
                  </span>
                </div>
              )}

              {/* Date range */}
              <div className="text-xs text-muted-foreground">
                From{' '}
                <span className="tabular-nums">
                  {new Date(v.valid_from).toLocaleString()}
                </span>
                {v.valid_to ? (
                  <>
                    {' '}to{' '}
                    <span className="tabular-nums">
                      {new Date(v.valid_to).toLocaleString()}
                    </span>
                  </>
                ) : (
                  <span className="ml-1 text-muted-foreground">(current)</span>
                )}
              </div>

              {/* Notes */}
              {v.notes && (
                <div className="text-sm text-foreground border-t border-border pt-1.5">
                  {v.notes}
                </div>
              )}
            </div>
          ))}
      </div>
    </AdaptiveModal>
  );
}
