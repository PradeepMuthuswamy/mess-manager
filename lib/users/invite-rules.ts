/** Roles invited from mess-admin. This app never creates them. */
export function opsInviteBlock(role: string): string | null {
  if (role === 'super_admin' || role === 'unit_admin') {
    return 'Invite super_admin and unit_admin from the admin console';
  }
  return null;
}
