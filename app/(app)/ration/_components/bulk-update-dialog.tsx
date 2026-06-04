'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { bulkUpdateScaleItemsAction } from '@/lib/ration/actions';

type Op = 'set' | 'multiply' | 'add_percent';

const OP_LABEL: Record<Op, string> = {
  set: 'Set quantity to',
  multiply: 'Multiply by',
  add_percent: 'Increase by (%)',
};

const OP_HINT: Record<Op, string> = {
  set: 'All selected items will be set to this exact quantity.',
  multiply: 'Existing quantities × factor (e.g. 1.25 = +25%).',
  add_percent: 'Existing quantities + N% (e.g. 25 = +25%).',
};

export function BulkUpdateDialog({
  open,
  scaleId,
  itemIds,
  itemNames,
  onClose,
}: {
  open: boolean;
  scaleId: string;
  itemIds: string[];
  itemNames: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [op, setOp] = useState<Op>('set');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function handleApply() {
    const v = Number(value);
    if (!Number.isFinite(v)) {
      toast.error('Enter a numeric value');
      return;
    }
    if (op === 'set' && v < 0) {
      toast.error('Quantity must be ≥ 0');
      return;
    }
    if (op === 'multiply' && v < 0) {
      toast.error('Multiplier must be ≥ 0');
      return;
    }
    startTransition(async () => {
      const res = await bulkUpdateScaleItemsAction({
        scale_id: scaleId,
        item_ids: itemIds,
        operation: op,
        value: v,
        notes: notes.trim() || undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const { updated, skipped, failed } = res.result!;
      if (failed === 0 && skipped === 0) {
        toast.success(`Updated ${updated} item${updated === 1 ? '' : 's'}`);
      } else {
        toast.warning(
          `Updated ${updated}, skipped ${skipped}, failed ${failed}`,
        );
      }
      setValue('');
      setNotes('');
      router.refresh();
      onClose();
    });
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={`Bulk update (${itemIds.length} item${itemIds.length === 1 ? '' : 's'})`}
      description="Apply the same change to every selected entitlement. A new version is recorded for each updated item."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={pending || !value}
            className="transition-ds press"
          >
            {pending ? 'Applying…' : `Apply to ${itemIds.length}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
          <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {itemNames.slice(0, 12).join(', ')}
            {itemNames.length > 12 ? ` and ${itemNames.length - 12} more` : ''}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-op" className="text-sm font-medium">
                Operation
              </Label>
              <Select value={op} onValueChange={(v) => setOp(v as Op)}>
                <SelectTrigger id="bulk-op">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">{OP_LABEL.set}</SelectItem>
                  <SelectItem value="multiply">{OP_LABEL.multiply}</SelectItem>
                  <SelectItem value="add_percent">{OP_LABEL.add_percent}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-value" className="text-sm font-medium">
                Value
              </Label>
              <Input
                id="bulk-value"
                type="number"
                step="0.001"
                value={value}
                onChange={(e) => setValue(e.currentTarget.value)}
                placeholder={op === 'multiply' ? '1.25' : op === 'add_percent' ? '25' : '0.230'}
                className="font-mono tabular-nums"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{OP_HINT[op]}</p>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-notes" className="text-sm font-medium">
              Notes
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="bulk-notes"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
              placeholder="Reason for change"
            />
          </div>
        </div>
    </AdaptiveModal>
  );
}
