'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { setUiPreferenceAction } from '@/lib/preferences/actions';
import type { ModalStyle, UiPreferences } from '@/lib/preferences/types';

export function UiPreferencesCard({ prefs }: { prefs: UiPreferences }) {
  const [isPending, startTransition] = useTransition();

  function handleModalStyleChange(value: string) {
    const modal_style = value as ModalStyle;
    startTransition(async () => {
      const result = await setUiPreferenceAction({ modal_style });
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Preference saved');
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Interface preferences</CardTitle>
        <CardDescription>
          Control how dialogs and panels appear across the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="modal-style" className="text-sm font-medium">Modal style</Label>
            <Select
              value={prefs.modal_style}
              onValueChange={handleModalStyleChange}
              disabled={isPending}
            >
              <SelectTrigger id="modal-style" className="transition-ds sm:max-w-sm">
                <SelectValue placeholder="Choose a style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dialog">Centered dialog</SelectItem>
                <SelectItem value="sheet">Slide-in sheet</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Applies to forms and detail views that open in an overlay.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
