'use client';

import { useEffect, useState } from 'react';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getScaleItemHistoryAction } from '@/lib/ration/actions';
import type { RationScaleItemVersionRow } from '@/lib/ration/types';

export function VersionHistorySheet({
  scaleId,
  item,
  open,
  onClose,
}: {
  scaleId: string;
  item: { id: string; name: string } | null;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RationScaleItemVersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    let cancelled = false;
    setLoading(true);
    setRows(null);
    setError(null);
    getScaleItemHistoryAction(scaleId, item.id).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
      } else {
        setRows(res.rows ?? []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [scaleId, item, open]);

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Version history"
      description={item?.name ?? ''}
    >
      <div className="space-y-3 px-4 py-4">
          {loading ? (
            <div className="space-y-3" aria-label="Loading history">
              {[80, 72, 64].map((h, i) => (
                <Skeleton key={i} className="w-full rounded-md" style={{ height: `${h}px` }} />
              ))}
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load history</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!loading && rows && rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No history yet.</p>
          ) : null}

          {rows != null && rows.length > 0 ? (
            <ol className="relative space-y-0 border-l border-border pl-4">
              {rows.map((v, idx) => {
                const isCurrent = v.valid_to == null;
                return (
                  <li key={v.id} className="relative pb-4 last:pb-0">
                    {/* Timeline dot */}
                    <span
                      className={
                        'absolute -left-[1.125rem] mt-1 flex size-3.5 items-center justify-center rounded-full border-2 ' +
                        (isCurrent
                          ? 'border-primary bg-primary'
                          : 'border-border bg-card')
                      }
                    />
                    <div className="transition-ds ml-2 rounded-md border border-border bg-card p-3 hover:bg-muted/40">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="font-mono tabular-nums text-sm font-medium text-foreground">
                            {Number(v.auth_qty).toFixed(3).replace(/\.?0+$/, '')}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">{v.uom}</span>
                          </p>
                          <p className="font-mono tabular-nums text-xs text-muted-foreground">
                            v{rows.length - idx}
                          </p>
                        </div>
                        {isCurrent ? (
                          <Badge className="shrink-0">Current</Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">Past</Badge>
                        )}
                      </div>
                      <div className="mt-2 space-y-0.5">
                        <p className="text-xs text-muted-foreground tabular-nums">
                          From {new Date(v.valid_from).toLocaleString()}
                        </p>
                        {v.valid_to ? (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            To {new Date(v.valid_to).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      {v.notes ? (
                        <p className="mt-2 text-sm text-foreground">{v.notes}</p>
                      ) : null}
                      {v.created_by ? (
                        <p className="mt-1 font-mono tabular-nums text-xs text-muted-foreground">
                          by {v.created_by.slice(0, 8)}&hellip;
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
      </div>
    </AdaptiveModal>
  );
}
