'use client';

import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { selectUsersUi, updateFormField, changeRole } from '@/lib/redux/users/slice';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { Role } from '@/lib/auth/types';
import { FUNCTIONAL_ROLES } from '../user-form-dialog';

interface ProfileTabProps {
  isEditing: boolean;
  units: any[];
  currentUser: any;
}

export function ProfileTab({
  isEditing,
  units,
  currentUser,
}: ProfileTabProps) {
  const dispatch = useAppDispatch();
  const { form } = useAppSelector(selectUsersUi);
  const { email, fullName, rank, serviceNo, role, unitId } = form;

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
    <div className="space-y-4 mt-4">
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => dispatch(updateFormField({ field: 'email', value: e.target.value }))}
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
            onChange={(e) => dispatch(updateFormField({ field: 'fullName', value: e.target.value }))}
            placeholder="e.g. John Doe"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rank" className="text-sm font-medium">Rank / Designation</Label>
          <Input
            id="rank"
            value={rank}
            onChange={(e) => dispatch(updateFormField({ field: 'rank', value: e.target.value }))}
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
            onChange={(e) => dispatch(updateFormField({ field: 'serviceNo', value: e.target.value }))}
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
              const fr = FUNCTIONAL_ROLES.find((r) => r.key === 'mess_secretary');
              dispatch(
                changeRole({
                  role: nextRole,
                  messSecretaryCapabilities: fr?.capabilities || [],
                })
              );
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
          onChange={(e) => dispatch(updateFormField({ field: 'unitId', value: e.target.value || null }))}
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
    </div>
  );
}
