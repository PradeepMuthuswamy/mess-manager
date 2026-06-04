'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createScaleAction } from '@/lib/ration/actions';
import {
  rationClassEnum,
  rationTerrainEnum,
  RATION_CLASS_LABEL,
  RATION_TERRAIN_LABEL,
  type RationClass,
  type RationTerrain,
} from '@/lib/schemas/ration';

type ActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
} | null;

export function NewScaleDialog({
  unitId,
  defaultRankClass,
  defaultTerrain,
  variant = 'default',
}: {
  unitId: string;
  defaultRankClass?: RationClass;
  defaultTerrain?: RationTerrain;
  variant?: 'default' | 'ghost' | 'outline' | 'secondary';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rankClass, setRankClass] = useState<RationClass>(defaultRankClass ?? 'officer');
  const [terrain, setTerrain] = useState<RationTerrain>(defaultTerrain ?? 'plains');
  const [name, setName] = useState('');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createScaleAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success('Scale created');
      setOpen(false);
      setName('');
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const autoName = `${RATION_CLASS_LABEL[rankClass]} — ${RATION_TERRAIN_LABEL[terrain]}`;

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New scale
      </Button>
      <AdaptiveModal
        open={open}
        onClose={() => setOpen(false)}
        title="New ration scale"
        description="One scale per rank class and terrain. Each scale lists items and daily per-person quantities."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-scale-form"
              disabled={pending}
              className="transition-ds press"
            >
              {pending ? 'Creating…' : 'Create scale'}
            </Button>
          </>
        }
      >
        <form id="new-scale-form" action={formAction} className="space-y-4">
          <input type="hidden" name="unit_id" value={unitId} />
          <input type="hidden" name="rank_class" value={rankClass} />
          <input type="hidden" name="terrain" value={terrain} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="scale-rank" className="text-sm font-medium">
                Rank class
              </Label>
              <Select
                value={rankClass}
                onValueChange={(v) => setRankClass(v as RationClass)}
              >
                <SelectTrigger id="scale-rank">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rationClassEnum.map((c) => (
                    <SelectItem key={c} value={c}>
                      {RATION_CLASS_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scale-terrain" className="text-sm font-medium">
                Terrain
              </Label>
              <Select
                value={terrain}
                onValueChange={(v) => setTerrain(v as RationTerrain)}
              >
                <SelectTrigger id="scale-terrain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rationTerrainEnum.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RATION_TERRAIN_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <input type="hidden" name="name" value={name.trim() || autoName} />
          <div className="space-y-1.5">
            <Label htmlFor="scale-name" className="text-sm font-medium">
              Display name
            </Label>
            <Input
              id="scale-name"
              maxLength={120}
              placeholder={autoName}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use &ldquo;{autoName}&rdquo;.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scale-desc" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="scale-desc"
              name="description"
              maxLength={500}
              rows={3}
              placeholder="Daily per-person authorisations for this group."
            />
          </div>
        </form>
      </AdaptiveModal>
    </>
  );
}
