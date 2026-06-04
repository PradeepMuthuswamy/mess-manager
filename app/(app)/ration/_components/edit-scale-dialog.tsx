'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { updateScaleAction } from '@/lib/ration/actions';
import type { RationScaleRow } from '@/lib/ration/types';

type ActionState = {
  ok?: boolean;
  error?: string;
  details?: unknown;
} | null;

export function EditScaleDialog({
  scale,
  triggerLabel = 'Edit',
  triggerVariant = 'outline',
}: {
  scale: Pick<RationScaleRow, 'id' | 'name' | 'description'>;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'ghost' | 'secondary';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateScaleAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success('Scale updated');
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <>
      <Button
        variant={triggerVariant}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
        {triggerLabel}
      </Button>

      <AdaptiveModal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit ration scale"
        description="Rename or describe this scale. Item authorisations are managed in the scale page."
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
              form="edit-scale-form"
              disabled={pending}
              className="transition-ds press"
            >
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <form
          id="edit-scale-form"
          action={formAction}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={scale.id} />

          <div className="space-y-1.5">
            <Label htmlFor="edit-scale-name" className="text-sm font-medium">
              Name
            </Label>
            <Input
              id="edit-scale-name"
              name="name"
              required
              maxLength={120}
              defaultValue={scale.name}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-scale-desc" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="edit-scale-desc"
              name="description"
              maxLength={500}
              rows={3}
              defaultValue={scale.description ?? ''}
            />
            <p className="text-xs text-muted-foreground">
              Optional context shown on the scale card.
            </p>
          </div>
        </form>
      </AdaptiveModal>
    </>
  );
}
