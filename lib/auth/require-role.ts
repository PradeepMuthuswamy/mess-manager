import { redirect } from 'next/navigation';
import { getCurrentUser } from './get-current-user';
import type { AuthUser, Role } from './types';

export async function requireUser(): Promise<AuthUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/sign-in');
  return u;
}

export async function requireRole(allowed: Role[]): Promise<AuthUser> {
  const u = await requireUser();
  if (!allowed.includes(u.role)) redirect('/dashboard');
  return u;
}
