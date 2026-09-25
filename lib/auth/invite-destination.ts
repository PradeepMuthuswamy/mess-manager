/**
 * super_admin and unit_admin open mess-admin. Every other role opens
 * mess-manager. A missing ops URL must fail the invite rather than
 * falling back to this host.
 */
export function inviteLinkBaseUrl(
  role: string,
  opsAppUrl: string | undefined,
): { baseUrl?: string } | { error: string } {
  if (role === 'super_admin' || role === 'unit_admin') {
    return {};
  }
  const baseUrl = opsAppUrl?.trim();
  if (!baseUrl) {
    return { error: 'NEXT_PUBLIC_OPS_APP_URL is not set' };
  }
  return { baseUrl };
}
