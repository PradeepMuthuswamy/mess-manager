'use client';

import { ShieldCheck } from 'lucide-react';
import type { Capability } from '@/lib/auth/types';
import { CustomCheckbox } from './custom-checkbox';
import { Label } from '@/components/ui/label';

interface CapabilityItem {
  key: Capability;
  label: string;
}

interface DomainCardProps {
  domain: string;
  domainLabel: string;
  caps: CapabilityItem[];
  selectedCapabilities: Capability[];
  isAllSelected: boolean;
  isPartSelected: boolean;
  onToggleDomain: (checked: boolean) => void;
  onToggleCapability: (cap: Capability, checked: boolean) => void;
}

export function DomainCard({
  domain,
  domainLabel,
  caps,
  selectedCapabilities,
  isAllSelected,
  isPartSelected,
  onToggleDomain,
  onToggleCapability,
}: DomainCardProps) {
  return (
    <div className="space-y-2 p-2.5 border border-border/60 rounded-lg bg-background/50">
      {/* Domain Header with Select All */}
      <div className="flex items-center justify-between border-b border-border/40 pb-1.5 select-none">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1">
          <ShieldCheck className="size-3.5 text-primary" /> {domainLabel}
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">
            Toggle Group
          </span>
          <CustomCheckbox
            id={`all-${domain}`}
            checked={isAllSelected ? true : (isPartSelected ? 'indeterminate' : false)}
            onCheckedChange={onToggleDomain}
          />
        </div>
      </div>

      {/* Capabilities grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
        {caps.map((c) => {
          const isChecked = selectedCapabilities.includes(c.key);
          return (
            <div
              key={c.key}
              onClick={() => onToggleCapability(c.key, !isChecked)}
              className={`flex items-start gap-2 p-1.5 rounded-md border cursor-pointer select-none transition-all ${
                isChecked
                  ? 'bg-primary/5 border-primary/20 text-primary'
                  : 'bg-transparent border-border/40 text-muted-foreground hover:bg-muted/10 hover:text-foreground'
              }`}
            >
              <CustomCheckbox
                id={c.key}
                checked={isChecked}
                onCheckedChange={(checked) => onToggleCapability(c.key, checked)}
                disabled={false}
                className="mt-0.5 scale-90"
              />
              <span className="text-[11px] leading-snug font-medium flex-1">
                {c.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
