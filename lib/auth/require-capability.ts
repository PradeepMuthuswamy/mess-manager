import { redirect } from 'next/navigation';
import { requireUser } from './require-role';
import type { AuthUser, Capability } from './types';
import { userHasCapability, userHasAnyCapability } from './capabilities';

// Re-export the pure helpers for backwards compatibility — but prefer importing them from
// '@/lib/auth/capabilities' in client components so server-only modules don't get bundled.
export { userHasCapability, userHasAnyCapability };

export async function requireCapability(
  cap: Capability,
  unitId?: string | null,
): Promise<AuthUser> {
  const u = await requireUser();
  if (!userHasCapability(u, cap, unitId)) redirect('/dashboard');
  return u;
}

export function requireAnyCapability(user: AuthUser, caps: Capability[]): boolean {
  return userHasAnyCapability(user, caps);
}
