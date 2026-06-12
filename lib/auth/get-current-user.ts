import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { AuthUser, GrantedCapability, Role } from './types';
import { ACTIVE_UNIT_COOKIE } from './types';

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, unit_id, display_name')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const { data: caps } = await supabase
    .from('user_capabilities')
    .select('capability, unit_id')
    .eq('user_id', user.id);

  const role = profile.role as Role;
  const cookieStore = await cookies();
  const cookieUnit = cookieStore.get(ACTIVE_UNIT_COOKIE)?.value ?? null;

  let activeUnitId: string | null;
  let isAllUnits: boolean;
  if (role === 'super_admin') {
    activeUnitId = cookieUnit && cookieUnit !== 'all' ? cookieUnit : null;
    isAllUnits = !activeUnitId;
  } else {
    activeUnitId = profile.unit_id;
    isAllUnits = false;
  }

  const capabilities: GrantedCapability[] = (caps ?? []).map((c) => ({
    capability: c.capability as GrantedCapability['capability'],
    unitId: c.unit_id,
  }));

  return {
    id: profile.id,
    email: profile.email ?? user.email ?? '',
    role,
    homeUnitId: profile.unit_id,
    activeUnitId,
    isAllUnits,
    displayName: profile.display_name ?? profile.full_name ?? profile.email ?? null,
    capabilities,
  };
});
