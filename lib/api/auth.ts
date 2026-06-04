import type { NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { Errors } from './errors';
import type { Database } from '@/lib/supabase/database.types';
import type { Role, Capability, GrantedCapability, AuthUser } from '@/lib/auth/types';
import { userHasCapability } from '@/lib/auth/capabilities';

function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') ?? '';
  if (!h.toLowerCase().startsWith('bearer ')) return null;
  return h.slice(7).trim() || null;
}

export type ApiContext = {
  user: AuthUser;
  /** Supabase client authorized with the user's JWT (RLS applies). */
  supabase: ReturnType<typeof createSupabaseClient<Database>>;
  /** Service-role client (RLS bypass — use after explicit role/capability check). */
  admin: ReturnType<typeof createServiceClient>;
};

export async function requireApiUser(req: NextRequest): Promise<ApiContext> {
  const token = bearer(req);
  if (!token) throw Errors.unauthenticated();

  const supabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw Errors.unauthenticated('Token invalid or expired');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, unit_id, display_name')
    .eq('id', user.id)
    .single();
  if (!profile) throw Errors.unauthenticated('Profile not found');

  const { data: caps } = await supabase
    .from('user_capabilities')
    .select('capability, unit_id')
    .eq('user_id', user.id);

  // Active unit from X-Unit-Id header or ?unit= query, admin only; otherwise home unit.
  const role = profile.role as Role;
  let activeUnitId: string | null = profile.unit_id;
  let isAllUnits = false;
  if (role === 'admin') {
    const url = new URL(req.url);
    const headerUnit = req.headers.get('x-unit-id');
    const queryUnit = url.searchParams.get('unit');
    const picked = headerUnit ?? queryUnit;
    activeUnitId = picked && picked !== 'all' ? picked : null;
    isAllUnits = !activeUnitId;
  }

  const capabilities: GrantedCapability[] = (caps ?? []).map((c) => ({
    capability: c.capability as Capability,
    unitId: c.unit_id,
  }));

  const authUser: AuthUser = {
    id: profile.id,
    email: profile.email ?? user.email ?? '',
    role,
    homeUnitId: profile.unit_id,
    activeUnitId,
    isAllUnits,
    displayName: profile.display_name ?? profile.full_name ?? profile.email ?? null,
    capabilities,
  };

  return { user: authUser, supabase, admin: createServiceClient() };
}

export async function requireApiRole(req: NextRequest, roles: Role[]): Promise<ApiContext> {
  const ctx = await requireApiUser(req);
  if (!roles.includes(ctx.user.role)) throw Errors.forbidden(`Requires role: ${roles.join('|')}`);
  return ctx;
}

export async function requireApiCapability(
  req: NextRequest,
  cap: Capability,
  unitId?: string | null,
): Promise<ApiContext> {
  const ctx = await requireApiUser(req);
  if (!userHasCapability(ctx.user, cap, unitId ?? null)) {
    throw Errors.forbidden(`Requires capability: ${cap}`);
  }
  return ctx;
}
