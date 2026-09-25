import 'server-only';
import { randomBytes } from 'node:crypto';
import { getCollection } from '@/lib/mongo';

/**
 * Email-verification link types accepted by /auth/confirm.
 */
export type AuthEmailLinkType =
  | 'recovery'
  | 'invite'
  | 'magiclink'
  | 'signup'
  | 'email_change';

export interface VerificationDoc {
  token: string;
  value: string;
  identifier: string;
  type: AuthEmailLinkType;
  expiresAt: Date;
  createdAt: Date;
  metadata?: Record<string, unknown>;
  used?: boolean;
  usedAt?: Date;
}

/**
 * Builds a first-party verification link for auth emails.
 *
 * Link format: ${siteUrl}/auth/confirm?token=...&type=...
 */
export function buildAuthConfirmLink(opts: {
  type: AuthEmailLinkType;
  token?: string;
  hashedToken?: string;
  next?: string;
  /** Override the app origin — e.g. the admin console sending an invite
   * for an ops-role account links to the user app instead of itself. */
  baseUrl?: string;
}): string {
  const siteUrl =
    opts.baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const tokenVal = opts.token ?? opts.hashedToken ?? '';
  const params = new URLSearchParams({
    token: tokenVal,
    type: opts.type,
  });
  if (opts.next) {
    params.set('next', opts.next);
  }
  return `${siteUrl}/auth/confirm?${params.toString()}`;
}

export function getExpirationForType(type: AuthEmailLinkType | string): Date {
  const now = Date.now();
  if (type === 'invite') {
    return new Date(now + 24 * 60 * 60 * 1000); // 24 hours
  }
  return new Date(now + 60 * 60 * 1000); // 1 hour for reset / recovery / magiclink
}

export async function generateVerificationToken(opts: {
  identifier: string;
  type: AuthEmailLinkType;
  metadata?: Record<string, unknown>;
  expiresInMs?: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = opts.expiresInMs
    ? new Date(Date.now() + opts.expiresInMs)
    : getExpirationForType(opts.type);

  const col = await getCollection<VerificationDoc>('verifications');
  await col.insertOne({
    token,
    value: token,
    identifier: opts.identifier.toLowerCase().trim(),
    type: opts.type,
    expiresAt,
    createdAt: new Date(),
    metadata: opts.metadata ?? {},
    used: false,
  });

  return { token, expiresAt };
}

export async function verifyAuthToken(
  token: string,
  type?: AuthEmailLinkType | string,
): Promise<{ valid: boolean; verification?: VerificationDoc; error?: string }> {
  if (!token) return { valid: false, error: 'Token is required' };
  const col = await getCollection<VerificationDoc>('verifications');
  const query: Record<string, unknown> = {
    $or: [{ token }, { value: token }],
    used: { $ne: true },
  };
  if (type) {
    query.type = type;
  }
  const verification = await col.findOne(query);
  if (!verification) {
    return { valid: false, error: 'Token not found or already used' };
  }
  if (new Date() > new Date(verification.expiresAt)) {
    return { valid: false, error: 'Token has expired' };
  }
  return { valid: true, verification };
}

export async function markTokenUsed(token: string): Promise<void> {
  const col = await getCollection<VerificationDoc>('verifications');
  await col.updateOne(
    { $or: [{ token }, { value: token }] },
    { $set: { used: true, usedAt: new Date() } },
  );
}

export type IssuedAuthConfirmLink = {
  error: { message: string } | null;
  /** First-party /auth/confirm URL, or null when token generation failed. */
  link: string | null;
  token: string | null;
  userId: string | null;
  email: string | undefined;
};

/**
 * generateToken + first-party /auth/confirm URL.
 * Stored in MongoDB verifications collection with expiration.
 * Callers still decide who may request the link, which origin to use,
 * and which error to show.
 */
export async function issueAuthConfirmLink(
  arg1: unknown,
  arg2?: unknown,
): Promise<IssuedAuthConfirmLink> {
  const opts = (arg2 ?? arg1) as {
    type: 'invite' | 'recovery' | 'magiclink';
    email: string;
    next?: string;
    data?: Record<string, unknown>;
    baseUrl?: string;
    expiresInMs?: number;
  };

  try {
    const { token } = await generateVerificationToken({
      identifier: opts.email,
      type: opts.type,
      metadata: opts.data,
      expiresInMs: opts.expiresInMs,
    });

    const link = buildAuthConfirmLink({
      type: opts.type,
      token,
      next: opts.next,
      baseUrl: opts.baseUrl,
    });

    return {
      error: null,
      link,
      token,
      userId: (opts.data?.userId as string | undefined) ?? (opts.data?.id as string | undefined) ?? null,
      email: opts.email,
    };
  } catch (err: unknown) {
    console.error('Error issuing auth confirm link:', err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Failed to issue auth confirmation link';
    return {
      error: { message },
      link: null,
      token: null,
      userId: null,
      email: opts.email,
    };
  }
}
