import 'server-only';

/**
 * Email-verification link types accepted by /auth/confirm (mirrors
 * Supabase EmailOtpType minus phone types).
 */
export type AuthEmailLinkType =
  | 'recovery'
  | 'invite'
  | 'magiclink'
  | 'signup'
  | 'email_change';

/**
 * Builds a first-party verification link for auth emails.
 *
 * We deliberately do NOT use `properties.action_link` from
 * `auth.admin.generateLink()` — that URL goes through GoTrue's
 * `/auth/v1/verify` endpoint, which returns the session in the URL
 * fragment (`#access_token=...`). Fragments never reach the server, so
 * the SSR cookie session is never established and the user lands on
 * the landing page unauthenticated.
 *
 * Instead we link to our own `/auth/confirm` route with the
 * `hashed_token`, which verifies server-side via `verifyOtp()` and
 * sets the session cookies before redirecting to `next`.
 */
export function buildAuthConfirmLink(opts: {
  type: AuthEmailLinkType;
  hashedToken: string;
  next: string;
  /** Override the app origin — e.g. the admin console sending an invite
   * for an ops-role account links to the user app instead of itself. */
  baseUrl?: string;
}): string {
  const siteUrl =
    opts.baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const params = new URLSearchParams({
    token_hash: opts.hashedToken,
    type: opts.type,
    next: opts.next,
  });
  return `${siteUrl}/auth/confirm?${params.toString()}`;
}

export type IssuedAuthConfirmLink = {
  error: { message: string } | null;
  /** First-party /auth/confirm URL, or null when generateLink failed. */
  link: string | null;
  userId: string | null;
  email: string | undefined;
};

type AuthLinkClient = {
  auth: {
    admin: {
      generateLink: (
        params:
          | {
              type: 'invite';
              email: string;
              options?: { data?: { [key: string]: string | number | boolean | null | undefined } };
            }
          | { type: 'recovery' | 'magiclink'; email: string },
      ) => Promise<{
        data: {
          user: { id: string; email?: string } | null;
          properties: { hashed_token?: string } | null;
        } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/**
 * generateLink + first-party /auth/confirm URL.
 * Callers still decide who may request the link, which origin to use,
 * and which error to show.
 */
export async function issueAuthConfirmLink(
  admin: AuthLinkClient,
  opts: {
    type: 'invite' | 'recovery' | 'magiclink';
    email: string;
    next: string;
    data?: { [key: string]: string | number | boolean | null | undefined };
    baseUrl?: string;
  },
): Promise<IssuedAuthConfirmLink> {
  const { data, error } = await admin.auth.admin.generateLink(
    opts.type === 'invite'
      ? {
          type: 'invite',
          email: opts.email,
          options: { data: opts.data ?? {} },
        }
      : { type: opts.type, email: opts.email },
  );

  const hashedToken = data?.properties?.hashed_token;
  const userId = data?.user?.id ?? null;
  const email = data?.user?.email;
  if (error || !hashedToken) {
    return { error, link: null, userId, email };
  }

  return {
    error: null,
    userId,
    email,
    link: buildAuthConfirmLink({
      type: opts.type,
      hashedToken,
      next: opts.next,
      baseUrl: opts.baseUrl,
    }),
  };
}
