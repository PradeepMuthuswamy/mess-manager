'use client';

import { useActionState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { SaveButton } from '@/components/shared/save-submit';
import { useActionResult } from '@/hooks/use-action-result';
import { updateProfileAction, type ProfileSaveState } from '../actions';

export function PersonalDetailsForm({
  email,
  fullName,
  rank,
  serviceNo,
  dateOfBirth,
  marriageDate,
}: {
  email: string;
  fullName: string;
  rank: string;
  serviceNo: string;
  dateOfBirth: string;
  marriageDate: string;
}) {
  const [state, formAction] = useActionState<ProfileSaveState, FormData>(
    updateProfileAction,
    null,
  );
  useActionResult(state, {
    onOk: () => toast.success('Personal details saved'),
    onError: (message) => toast.error(message),
  });

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <Input id="email" disabled value={email} readOnly />
        <p className="text-sm text-muted-foreground">Sign-in address — cannot be changed here.</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="full_name">
          Full name
        </label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={fullName}
          placeholder="As it appears on your ID card"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="rank">
            Rank
          </label>
          <Input
            id="rank"
            name="rank"
            defaultValue={rank}
            placeholder="e.g. Lieutenant Colonel"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="service_no">
            Service no.
          </label>
          <Input
            id="service_no"
            name="service_no"
            defaultValue={serviceNo}
            placeholder="e.g. IC-12345"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="date_of_birth">
            Date of birth
          </label>
          <Input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            defaultValue={dateOfBirth}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="marriage_date">
            Marriage date
          </label>
          <Input
            id="marriage_date"
            name="marriage_date"
            type="date"
            defaultValue={marriageDate}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Used to generate birthday and anniversary entries on the unit social calendar.
      </p>

      <div className="flex justify-end pt-2">
        <SaveButton className="transition-ds">Save changes</SaveButton>
      </div>
    </form>
  );
}
