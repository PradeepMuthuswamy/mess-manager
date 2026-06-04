'use client';
import { useState, useTransition } from 'react';
import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { setActiveUnitAction } from '@/app/(app)/_actions/active-unit';

type Unit = { id: string; name: string; code: string };

export function UnitSwitcher({
  current,
  units,
}: {
  current: string | null;
  units: Unit[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const currentUnit = units.find((u) => u.id === current);
  const label = currentUnit ? currentUnit.name : 'All units';

  function pick(value: string) {
    start(async () => {
      await setActiveUnitAction(value);
      setOpen(false);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          className="transition-ds justify-between gap-2 min-w-44 h-7 px-2 text-xs"
        >
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3 opacity-40 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-72 shadow-lg" align="end">
        <Command>
          <CommandInput placeholder="Search units..." className="text-sm" />
          <CommandList>
            <CommandEmpty>No units found.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => pick('all')} className="transition-ds">
                <Check
                  className={cn('mr-2 size-4', !currentUnit ? 'opacity-100' : 'opacity-0')}
                />
                All units
              </CommandItem>
              {units.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.name} ${u.code}`}
                  onSelect={() => pick(u.id)}
                  className="transition-ds"
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      currentUnit?.id === u.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="font-medium">{u.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground tabular">{u.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
