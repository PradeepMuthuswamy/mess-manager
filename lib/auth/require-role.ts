import { redirect } from 'next/navigation';
import { getCurrentUser } from './get-current-user';
import type { AuthUser, Role } from './types';

export async function requireUser(): Promise<AuthUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/sign-in');

  // App segregation: admin accounts manage the platform from the Admin
  // Console and may not hold a session in the ops app. Any session they
  // still have here (e.g. created before this rule) is terminated via
  // the signout route — server components can't clear cookies directly.
  if (u.role === 'admin') {
    redirect('/auth/signout?error=admin_console');
  }

  return u;
}

export async function requireRole(allowed: Role[]): Promise<AuthUser> {
  const u = await requireUser();
  if (!allowed.includes(u.role)) redirect('/dashboard');
  return u;
}
