'use client';

import { useState, useEffect, useTransition } from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { selectUsersUi, setError as reduxSetError } from '@/lib/redux/users/slice';
import { toast } from 'sonner';
import { KeyRound, User } from 'lucide-react';

import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppContext } from '@/lib/auth/context';
import { FormError } from '@/components/shared/form-error';

import { inviteUserAction, updateUserAction, updateUserCapabilitiesAction } from '@/lib/users/actions';
import { ProfileTab } from './form-dialog/profile-tab';
import { PermissionsTab } from './form-dialog/permissions-tab';

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
  const { user: currentUser } = useAppContext();
  const isEditing = !!user;
  const dispatch = useAppDispatch();

  const [activeTab, setActiveTab] = useState('profile');
  const { form, error } = useAppSelector(selectUsersUi);
  const { email, fullName, rank, serviceNo, role, unitId, selectedCapabilities } = form;

  const [isPending, startTransition] = useTransition();

  // Reset active tab only when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('profile');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(reduxSetError(null));

    if (!isEditing && !email) {
      dispatch(reduxSetError('Email is required.'));
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
          dispatch(reduxSetError(profileRes.error));
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
            dispatch(reduxSetError(capsRes.error));
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
          dispatch(reduxSetError(res.error || 'Failed to send invitation.'));
        }
      }
    });
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
            <ProfileTab
              isEditing={isEditing}
              units={units}
              currentUser={currentUser}
            />
          </TabsContent>

          {/* Capabilities Checklist Tab */}
          <TabsContent value="permissions" className="space-y-4 mt-4">
            <PermissionsTab templates={templates} />
          </TabsContent>
        </Tabs>
      </form>
    </AdaptiveModal>
  );
}
