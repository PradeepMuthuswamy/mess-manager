'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';

export type ProfileSaveState = { ok: true } | { error: string } | null;

function optionalIsoDate(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export async function updateProfileAction(
  _prev: ProfileSaveState,
  formData: FormData,
): Promise<ProfileSaveState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: String(formData.get('full_name') ?? '').trim() || null,
      service_no: String(formData.get('service_no') ?? '').trim() || null,
      rank: String(formData.get('rank') ?? '').trim() || null,
      date_of_birth: optionalIsoDate(formData.get('date_of_birth')),
      marriage_date: optionalIsoDate(formData.get('marriage_date')),
    })
    .eq('id', user.id)
    .select('id');

  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Could not save personal details.' };

  revalidatePath('/settings');
  revalidatePath('/calendar');
  return { ok: true };
}
