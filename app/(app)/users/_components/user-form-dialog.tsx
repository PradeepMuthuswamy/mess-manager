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

  const isSuperAdmin = currentUser.role === 'admin';
  const displayRoles = isSuperAdmin ? ['user', 'manager', 'unit_admin', 'admin'] : ['user', 'manager'];

  const formatRoleLabel = (r: string) => {
    switch (r) {
      case 'admin':
        return 'Super Admin';
      case 'unit_admin':
        return 'Unit Admin';
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
                  onChange={(e) => setRole(e.target.value as Role)}
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
            <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg border border-border">
              <div>
                <Label htmlFor="template" className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground block mb-1">
                  Quick Select Template
                </Label>
                <p className="text-[11px] text-muted-foreground leading-normal max-w-sm">
                  Apply a pre-defined set of capabilities for a specific role or assignment.
                </p>
              </div>
              <select
                id="template"
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none"
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
            <div className="space-y-6 max-h-[45vh] overflow-y-auto pr-1">
              {Object.entries(capabilitiesByDomain).map(([domain, caps]) => {
                const domainLabel = CAPABILITY_DOMAIN_LABELS[domain] ?? domain;
                const isAllSelected = isDomainFullySelected(domain);
                const isPartSelected = isDomainPartiallySelected(domain);

                return (
                  <div key={domain} className="space-y-3 p-3 border border-border/60 rounded-lg bg-background/50 hover:bg-background/80 transition-ds">
                    {/* Domain Header with Select All */}
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="size-4 text-primary" /> {domainLabel}
                      </h3>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`all-${domain}`} className="text-xs cursor-pointer text-muted-foreground">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {caps.map((c) => {
                        const isChecked = selectedCapabilities.includes(c.key);
                        return (
                          <div
                            key={c.key}
                            onClick={() => handleToggleCapability(c.key, !isChecked)}
                            className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer select-none transition-ds ${
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
                              className="mt-0.5"
                            />
                            <Label htmlFor={c.key} className="text-xs leading-normal font-medium cursor-pointer flex-1">
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
          </TabsContent>
        </Tabs>
      </form>
    </AdaptiveModal>
  );
}
