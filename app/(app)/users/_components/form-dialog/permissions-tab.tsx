'use client';

import { useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import {
  selectUsersUi,
  toggleAssignment,
  toggleCapability,
  toggleDomain,
  applyTemplate,
} from '@/lib/redux/users/slice';
import { Label } from '@/components/ui/label';
import { FUNCTIONAL_ROLES } from '../user-form-dialog';
import { AssignmentCard } from './assignment-card';
import { DomainCard } from './domain-card';
import {
  CAPABILITIES,
  CAPABILITY_DOMAIN_LABELS,
  CAPABILITY_ACTION_LABELS,
  type Capability,
} from '@/lib/auth/types';

interface PermissionsTabProps {
  templates: any[];
}

export function PermissionsTab({ templates }: PermissionsTabProps) {
  const dispatch = useAppDispatch();
  const { form } = useAppSelector(selectUsersUi);
  const { selectedCapabilities, selectedTemplateId } = form;

  // Group capabilities by domain
  const capabilitiesByDomain = useMemo(() => {
    const groups: Record<string, { key: Capability; label: string }[]> = {};
    
    for (const cap of CAPABILITIES) {
      const domain = cap.split('.')[0];
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push({
        key: cap,
        label: CAPABILITY_ACTION_LABELS[cap] ?? cap,
      });
    }
    
    return groups;
  }, []);

  const selectedAssignments = useMemo(() => {
    return FUNCTIONAL_ROLES.filter((fr) => {
      return fr.capabilities.every((c) => selectedCapabilities.includes(c as Capability));
    }).map((fr) => fr.key);
  }, [selectedCapabilities]);

  const handleToggleAssignment = (key: string, checked: boolean) => {
    const fr = FUNCTIONAL_ROLES.find((r) => r.key === key);
    if (!fr) return;
    dispatch(toggleAssignment({ key, checked, capabilities: fr.capabilities }));
  };

  const handleTemplateChange = (templateId: string) => {
    if (!templateId) {
      dispatch(applyTemplate({ templateId: '', capabilities: [] }));
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (template && template.capabilities) {
      dispatch(applyTemplate({ templateId, capabilities: template.capabilities as Capability[] }));
    }
  };

  const handleToggleCapability = (cap: Capability, checked: boolean) => {
    dispatch(toggleCapability({ capability: cap, checked }));
  };

  const handleToggleDomain = (domain: string, checked: boolean) => {
    const domainCaps = capabilitiesByDomain[domain].map((c) => c.key);
    dispatch(toggleDomain({ domainCaps, checked }));
  };

  // Determine if all capabilities in a domain are selected
  const isDomainFullySelected = (domain: string) => {
    const domainCaps = capabilitiesByDomain[domain].map((c) => c.key);
    return domainCaps.every((c) => selectedCapabilities.includes(c));
  };

  // Determine if some capabilities in a domain are selected
  const isDomainPartiallySelected = (domain: string) => {
    const domainCaps = capabilitiesByDomain[domain].map((c) => c.key);
    const selectedCount = domainCaps.filter((c) => selectedCapabilities.includes(c)).length;
    return selectedCount > 0 && selectedCount < domainCaps.length;
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="space-y-3">
        <Label className="text-sm font-medium">Functional Permissions (Assignments)</Label>
        <p className="text-xs text-muted-foreground">Select multiple assignments to automatically grant corresponding access permissions.</p>
        <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-border bg-muted/10 p-3">
          {FUNCTIONAL_ROLES.map((fr) => {
            const isChecked = selectedAssignments.includes(fr.key);
            return (
              <AssignmentCard
                key={fr.key}
                label={fr.label}
                description={fr.description}
                isChecked={isChecked}
                onCheckedChange={(checked) => handleToggleAssignment(fr.key, checked)}
              />
            );
          })}
        </div>
      </div>

      {/* Advanced custom capabilities section */}
      <details className="group border border-border/60 rounded-lg bg-muted/5 mt-4">
        <summary className="flex items-center justify-between p-3 font-medium text-sm text-muted-foreground hover:text-foreground cursor-pointer select-none">
          <span>Advanced / Custom Capabilities</span>
          <span className="text-xs border border-border/50 rounded px-1.5 py-0.5 group-open:hidden">Show</span>
          <span className="text-xs border border-border/50 rounded px-1.5 py-0.5 hidden group-open:inline">Hide</span>
        </summary>
        <div className="p-3 border-t border-border/40 space-y-4">
          <div className="flex items-center justify-between gap-4 p-2.5 bg-background rounded-lg border border-border">
            <div>
              <Label htmlFor="template" className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground block mb-0.5">
                Quick Select Template
              </Label>
              <p className="text-[10px] text-muted-foreground leading-normal max-w-sm">
                Apply a pre-defined set of capabilities.
              </p>
            </div>
            <select
              id="template"
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 py-0.5 text-xs shadow-xs focus-visible:outline-none"
            >
              <option value="">Custom Permissions</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Granular Checklist */}
          <div className="space-y-4 max-h-[30vh] overflow-y-auto pr-1 mt-2">
            {Object.entries(capabilitiesByDomain).map(([domain, caps]) => {
              const domainLabel = CAPABILITY_DOMAIN_LABELS[domain] ?? domain;
              const isAllSelected = isDomainFullySelected(domain);
              const isPartSelected = isDomainPartiallySelected(domain);

              return (
                <DomainCard
                  key={domain}
                  domain={domain}
                  domainLabel={domainLabel}
                  caps={caps}
                  selectedCapabilities={selectedCapabilities}
                  isAllSelected={isAllSelected}
                  isPartSelected={isPartSelected}
                  onToggleDomain={(checked) => handleToggleDomain(domain, checked)}
                  onToggleCapability={handleToggleCapability}
                />
              );
            })}
          </div>
        </div>
      </details>
    </div>
  );
}
