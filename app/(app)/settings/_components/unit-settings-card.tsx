'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { setUnitConfigAction } from '@/lib/attendance/actions';
import {
  messTypeEnum,
  MESS_TYPE_LABEL,
  type MessType,
} from '@/lib/schemas/attendance';
import {
  rationTerrainEnum,
  RATION_TERRAIN_LABEL,
  type RationTerrain,
} from '@/lib/schemas/ration';

export function UnitSettingsCard({
  unitId,
  unitName,
  messType,
  terrain,
}: {
  unitId: string;
  unitName: string;
  messType: MessType | null;
  terrain: RationTerrain | null;
}) {
  const router = useRouter();
  const [mess, setMess] = useState<MessType | undefined>(messType ?? undefined);
  const [terr, setTerr] = useState<RationTerrain | undefined>(
    terrain ?? undefined,
  );
  const [pending, startTransition] = useTransition();

  const dirty = mess !== (messType ?? undefined) || terr !== (terrain ?? undefined);

  function save() {
    startTransition(async () => {
      const res = await setUnitConfigAction({
        unit_id: unitId,
        mess_type: mess,
        terrain: terr,
      });
      if ('ok' in res) {
        toast.success('Unit settings saved');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not save');
      }
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Unit settings</CardTitle>
        <CardDescription>
          Mess type and terrain for {unitName}. Together these determine the
          unit&apos;s ration authorisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="mess-type" className="text-sm font-medium">Mess type</Label>
            <Select
              value={mess}
              onValueChange={(v) => setMess(v as MessType)}
              disabled={pending}
            >
              <SelectTrigger id="mess-type" className="transition-ds w-full">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {messTypeEnum.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MESS_TYPE_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="terrain" className="text-sm font-medium">Terrain</Label>
            <Select
              value={terr}
              onValueChange={(v) => setTerr(v as RationTerrain)}
              disabled={pending}
            >
              <SelectTrigger id="terrain" className="transition-ds w-full">
                <SelectValue placeholder="Not set" />
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
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={save} disabled={pending || !dirty} className="transition-ds">
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}
