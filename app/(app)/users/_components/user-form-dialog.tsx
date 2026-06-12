'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, ShieldAlert, KeyRound, User } from 'lucide-react';

import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppContext } from '@/lib/auth/context';
import { FormError } from '@/components/shared/form-error';
import { cn } from '@/lib/utils';

export const FUNCTIONAL_ROLES = [
  {
    key: 'mess_secretary',
    label: 'Mess Secretary',
    description: 'Full access to all mess operations (masters, attendance, rations, inventory, bar, rooms, parties, billing, users).',
    capabilities: [
      'masters.read', 'masters.write', 'masters.write.global',
      'attendance.read', 'attendance.write', 'attendance.finalize',
      'ration.read', 'ration.issue', 'ration.adjust',
      'inventory.read', 'inventory.write',
      'bar.read', 'bar.write', 'bar.finalize',
      'rooms.read', 'rooms.booking.write', 'rooms.manage',
      'parties.read', 'parties.write', 'parties.finalize',
      'users.read', 'users.invite', 'users.manage',
      'reports.unit', 'reports.cross_unit',
      'billing.read', 'billing.draft', 'billing.finalize'
    ]
  },
  {
    key: 'food_member',
    label: 'Food Member',
    description: 'Access to messing operations (daily attendance, ration issues, stock management, and unit reports).',
    capabilities: [
      'attendance.read', 'attendance.write',
      'ration.read', 'ration.issue',
      'inventory.read', 'inventory.write',
      'reports.unit'
    ]
  },
  {
    key: 'wine_member',
    label: 'Wine Member',
    description: 'Access to bar consumption logs and bar inventory.',
    capabilities: [
      'bar.read', 'bar.write',
      'inventory.read', 'inventory.write'
    ]
  },
  {
    key: 'property_member',
    label: 'Property Member',
    description: 'Access to guest rooms, bookings, and room inventory management.',
    capabilities: [
      'rooms.read', 'rooms.booking.write', 'rooms.manage'
    ]
  }
] as const;

import {
  CAPABILITIES,
  CAPABILITY_DOMAIN_LABELS,
  CAPABILITY_ACTION_LABELS,
  type Role,
  type Capability,
} from '@/lib/auth/types';
import { inviteUserAction, updateUserAction, updateUserCapabilitiesAction } from '@/lib/users/actions';

interface UserFormDialogProps {
  open: boolean;
  onClose: () => void;
  user?: any | null; // Null when inviting, user object when editing
  units: any[];
  templates: any[];
}

export function UserFormDialog({
  open,
  onClose,
  user,
  units,
  templates,
}: UserFormDialogProps) {
  const { user: currentUser, activeUnitId } = useAppContext();
  const isEditing = !!user;

  const [activeTab, setActiveTab] = useState('profile');

  // Profile Form States
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [rank, setRank] = useState('');
  const [serviceNo, setServiceNo] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [unitId, setUnitId] = useState<string | null>(activeUnitId);

  // Capabilities States
  const [selectedCapabilities, setSelectedCapabilities] = useState<Capability[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedAssignments = useMemo(() => {
    return FUNCTIONAL_ROLES.filter((fr) => {
      return fr.capabilities.every((c) => selectedCapabilities.includes(c as Capability));
    }).map((fr) => fr.key);
  }, [selectedCapabilities]);

  const handleToggleAssignment = (key: string, checked: boolean) => {
    const fr = FUNCTIONAL_ROLES.find((r) => r.key === key);
    if (!fr) return;
    setSelectedTemplateId('');
    setSelectedCapabilities((prev) => {
      let next = [...prev];
      if (checked) {
        fr.capabilities.forEach((c) => {
          if (!next.includes(c as Capability)) next.push(c as Capability);
        });
        if (key === 'mess_secretary') {
          setRole('mess_secretary');
        }
      } else {
        next = next.filter((c) => !(fr.capabilities as readonly string[]).includes(c));
        if (key === 'mess_secretary' && role === 'mess_secretary') {
          setRole('user');
        }
      }
      return next;
    });
  };

  // Initialize values when modal opens
  useEffect(() => {
    if (open) {
      setError(null);
      setActiveTab('profile');
      
      if (isEditing && user) {
        setEmail(user.email || '');
        setFullName(user.full_name || '');
        setRank(user.rank || '');
        setServiceNo(user.service_no || '');
        setRole(user.role as Role);
        setUnitId(user.unit_id);
        
        // Extract capabilities granted
        const caps = (user.user_capabilities || []).map((uc: any) => uc.capability as Capability);
        setSelectedCapabilities(caps);
        setSelectedTemplateId('');
      } else {
        setEmail('');
        setFullName('');
        setRank('');
        setServiceNo('');
        setRole('user');
        setUnitId(activeUnitId);
        setSelectedCapabilities([]);
        setSelectedTemplateId('');
      }
    }
  }, [open, user, isEditing, activeUnitId]);

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

  // Handle template selection
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const template = templates.find((t) => t.id === templateId);
    if (template && template.capabilities) {
      setSelectedCapabilities(template.capabilities as Capability[]);
    }
  };

  // Toggle individual capability selection
  const handleToggleCapability = (cap: Capability, checked: boolean) => {
    setSelectedTemplateId(''); // Reset selected template if manual edit occurs
    if (checked) {
      setSelectedCapabilities((prev) => [...prev, cap]);
    } else {
      setSelectedCapabilities((prev) => prev.filter((c) => c !== cap));
    }
  };

  // Toggle all capabilities in a specific domain
  const handleToggleDomain = (domain: string, checked: boolean) => {
    setSelectedTemplateId('');
    const domainCaps = capabilitiesByDomain[domain].map((c) => c.key);
    
    if (checked) {
      setSelectedCapabilities((prev) => {
        const filtered = prev.filter((c) => !domainCaps.includes(c));
        return [...filtered, ...domainCaps];
      });
    } else {
      setSelectedCapabilities((prev) => prev.filter((c) => !domainCaps.includes(c)));
    }
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

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isEditing && !email) {
      setError('Email is required.');
      return;
    }

    startTransition(async () => {
      if (isEditing && user) {
        // 1. Update Profile details
        const profileRes = await updateUserAction(user.id, {
          full_name: fullName,
          rank,
          service_no: serviceNo,
          role,
          unit_id: unitId,
        });

        if (profileRes.error) {
          setError(profileRes.error);
          return;
        }

        // 2. Update granular capabilities
        const resolvedUnit = unitId || user.unit_id;
        if (resolvedUnit) {
          const capsRes = await updateUserCapabilitiesAction(
            user.id,
            selectedCapabilities.map((cap) => ({
              capability: cap,
              unitId: resolvedUnit,
            }))
          );

          if (capsRes.error) {
            setError(capsRes.error);
            return;
          }
        }

        toast.success('User profile and permissions updated.');
        onClose();
      } else {
        // Invite new user
        const res = await inviteUserAction({
          email,
          full_name: fullName || undefined,
          unit_id: unitId,
          role,
          capabilities: selectedCapabilities,
        });

        if (res.ok) {
          toast.success('Invitation email sent.');
          onClose();
        } else {
          setError(res.error || 'Failed to send invitation.');
        }
      }
    });
  };

  const isSuperAdmin = currentUser.role === 'super_admin';
  const isUnitManager = currentUser.role === 'unit_admin' || currentUser.role === 'mess_secretary';
  const displayRoles = isSuperAdmin 
    ? ['user', 'manager', 'unit_admin', 'super_admin', 'mess_secretary', 'mess_havildar', 'bar_nco', 'property_nco'] 
    : isUnitManager
      ? ['user', 'manager', 'mess_secretary', 'mess_havildar', 'bar_nco', 'property_nco']
      : ['user', 'manager'];

  const formatRoleLabel = (r: string) => {
    switch (r) {
      case 'super_admin':
        return 'Super Admin';
      case 'unit_admin':
        return 'Unit Admin';
      case 'mess_secretary':
        return 'Mess Secretary';
      case 'mess_havildar':
        return 'Mess Havildar';
      case 'bar_nco':
        return 'Bar NCO';
      case 'property_nco':
        return 'Property NCO';
      case 'manager':
        return 'Manager';
      default:
        return 'Member (Diner)';
    }
  };

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Manage User Account' : 'Invite New User'}
      description={isEditing ? `Edit profile details and capabilities for ${email}.` : 'Invite a new user to join the unit.'}
      contentClassName="sm:max-w-2xl"
      footer={
        <div className="flex w-full justify-between items-center">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            {selectedCapabilities.length} permissions assigned
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending} className="transition-ds">
              Cancel
            </Button>
            <Button
              type="submit"
              form="user-form"
              disabled={isPending || (!isEditing && !email)}
              className="press"
            >
              {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Send Invite'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="py-4 space-y-4">
        {error && <FormError message={error} />}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="size-4" /> Profile Details
            </TabsTrigger>
            <TabsTrigger value="permissions" className="flex items-center gap-2">
              <KeyRound className="size-4" /> Capabilities
            </TabsTrigger>
          </TabsList>

          {/* Profile Details Tab */}
          <TabsContent value="profile" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@unit.mil"
                disabled={isEditing}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rank" className="text-sm font-medium">Rank / Designation</Label>
                <Input
                  id="rank"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  placeholder="e.g. Capt, Major"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="service_no" className="text-sm font-medium">Service Number</Label>
                <Input
                  id="service_no"
                  value={serviceNo}
                  onChange={(e) => setServiceNo(e.target.value)}
                  placeholder="e.g. IC-12345"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-sm font-medium">Role Type</Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => {
                    const nextRole = e.target.value as Role;
                    setRole(nextRole);
                    if (nextRole === 'mess_secretary') {
                      const fr = FUNCTIONAL_ROLES.find((r) => r.key === 'mess_secretary');
                      if (fr) {
                        setSelectedCapabilities((prev) => {
                          const next = [...prev];
                          fr.capabilities.forEach((c) => {
                            if (!next.includes(c as Capability)) next.push(c as Capability);
                          });
                          return next;
                        });
                      }
                    } else {
                      const fr = FUNCTIONAL_ROLES.find((r) => r.key === 'mess_secretary');
                      if (fr) {
                        setSelectedCapabilities((prev) =>
                          prev.filter((c) => !fr.capabilities.includes(c as Capability))
                        );
                      }
                    }
                  }}
                  disabled={isEditing && !isSuperAdmin}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none disabled:opacity-50"
                >
                  {displayRoles.map((r) => (
                    <option key={r} value={r}>
                      {formatRoleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="unit" className="text-sm font-medium">Scoped Unit</Label>
              <select
                id="unit"
                value={unitId || ''}
                onChange={(e) => setUnitId(e.target.value || null)}
                disabled={!isSuperAdmin}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none disabled:opacity-50"
              >
                <option value="">Global (All Units)</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              {!isSuperAdmin && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Unit scoping is locked to your home unit.
                </p>
              )}
            </div>
          </TabsContent>

          {/* Capabilities Checklist Tab */}
          <TabsContent value="permissions" className="space-y-4 mt-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Functional Permissions (Assignments)</Label>
              <p className="text-xs text-muted-foreground">Select multiple assignments to automatically grant corresponding access permissions.</p>
              <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-border bg-muted/10 p-3">
                {FUNCTIONAL_ROLES.map((fr) => {
                  const isChecked = selectedAssignments.includes(fr.key);
                  return (
                    <label
                      key={fr.key}
                      className={cn(
                        "flex items-start gap-3 rounded-md border p-2 transition-all cursor-pointer hover:bg-muted/35",
                        isChecked ? "bg-primary/5 border-primary/20 text-foreground" : "bg-background border-border/60 text-muted-foreground"
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => handleToggleAssignment(fr.key, checked === true)}
                        className="mt-0.5"
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-foreground">{fr.label}</span>
                        <span className="text-[11px] leading-normal text-muted-foreground">{fr.description}</span>
                      </div>
                    </label>
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
                      <div key={domain} className="space-y-2 p-2.5 border border-border/60 rounded-lg bg-background/50">
                        {/* Domain Header with Select All */}
                        <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1">
                            <ShieldCheck className="size-3.5 text-primary" /> {domainLabel}
                          </h3>
                          <div className="flex items-center gap-1.5">
                            <Label htmlFor={`all-${domain}`} className="text-[10px] cursor-pointer text-muted-foreground">
                              Toggle Group
                            </Label>
                            <Checkbox
                              id={`all-${domain}`}
                              checked={isAllSelected || (isPartSelected ? 'indeterminate' : false) as any}
                              onCheckedChange={(checked) => handleToggleDomain(domain, !!checked)}
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
                                onClick={() => handleToggleCapability(c.key, !isChecked)}
                                className={`flex items-start gap-2 p-1.5 rounded-md border cursor-pointer select-none transition-ds ${
                                  isChecked
                                    ? 'bg-primary/5 border-primary/20 text-primary'
                                    : 'bg-transparent border-border/40 text-muted-foreground hover:bg-muted/10 hover:text-foreground'
                                }`}
                              >
                                <Checkbox
                                  id={c.key}
                                  checked={isChecked}
                                  onCheckedChange={(checked) => handleToggleCapability(c.key, !!checked)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-0.5 scale-90"
                                />
                                <Label htmlFor={c.key} className="text-[11px] leading-snug font-medium cursor-pointer flex-1">
                                  {c.label}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          </TabsContent>
        </Tabs>
      </form>
    </AdaptiveModal>
  );
}
