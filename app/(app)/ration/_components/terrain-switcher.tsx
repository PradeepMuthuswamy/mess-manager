'use client';

import { useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mountain } from 'lucide-react';
import {
  rationTerrainEnum,
  RATION_TERRAIN_LABEL,
  type RationClass,
  type RationTerrain,
} from '@/lib/schemas/ration';

export function TerrainSwitcher({
  terrain,
  rankClass,
}: {
  terrain: RationTerrain;
  rankClass: RationClass;
}) {
  const router = useRouter();

  return (
    <Select
      value={terrain}
      onValueChange={(v) => {
        const params = new URLSearchParams();
        params.set('terrain', v);
        params.set('rank_class', rankClass);
        router.push(`/ration?${params.toString()}`);
      }}
    >
      <SelectTrigger className="transition-ds min-w-44 bg-muted/50 hover:bg-muted focus:ring-ring">
        <Mountain className="size-4 text-muted-foreground" />
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
  );
}
