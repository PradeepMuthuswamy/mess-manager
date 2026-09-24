import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockInsertOne = vi.fn().mockResolvedValue({ acknowledged: true });
const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });

vi.mock('@/lib/mongo', () => ({
  getCollection: vi.fn().mockResolvedValue({
    insertOne: (...args: Record<string, unknown>[]) => mockInsertOne(...args),
    findOne: (...args: Record<string, unknown>[]) => mockFindOne(...args),
    updateOne: (...args: Record<string, unknown>[]) => mockUpdateOne(...args),
  }),
}));

import {
  buildAuthConfirmLink,
  issueAuthConfirmLink,
  generateVerificationToken,
  verifyAuthToken,
  markTokenUsed,
} from './email-links';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mess-manager.com');
});

describe('buildAuthConfirmLink', () => {
  it('builds a first-party confirm URL from the token', () => {
    const link = buildAuthConfirmLink({
      type: 'recovery',
      token: 'secure_token_123',
      next: '/reset-password',
    });
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe('https://mess-manager.com/auth/confirm');
    expect(url.searchParams.get('token')).toBe('secure_token_123');
    expect(url.searchParams.get('type')).toBe('recovery');
    expect(url.searchParams.get('next')).toBe('/reset-password');
  });

  it('uses baseUrl when an ops-role link must open in another app', () => {
    const link = buildAuthConfirmLink({
      type: 'invite',
      token: 'tok_abc',
      next: '/accept-invite',
      baseUrl: 'https://admin.mess-manager.com',
    });
    expect(link.startsWith('https://admin.mess-manager.com/auth/confirm?')).toBe(true);
    const url = new URL(link);
    expect(url.searchParams.get('token')).toBe('tok_abc');
    expect(url.searchParams.get('type')).toBe('invite');
  });
});

describe('generateVerificationToken', () => {
  it('inserts a token into the verifications collection with expiration', async () => {
    const res = await generateVerificationToken({
      identifier: 'officer@unit.mil',
      type: 'invite',
      metadata: { role: 'user', unit_id: 'unit-1' },
    });

    expect(res.token).toBeDefined();
    expect(typeof res.token).toBe('string');
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        token: res.token,
        value: res.token,
        identifier: 'officer@unit.mil',
        type: 'invite',
        metadata: { role: 'user', unit_id: 'unit-1' },
        used: false,
      }),
    );
  });
});

describe('verifyAuthToken', () => {
  it('returns valid true when token is active and unexpired', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    mockFindOne.mockResolvedValueOnce({
      token: 'valid_token',
      identifier: 'test@example.com',
      type: 'recovery',
      expiresAt: futureDate,
      used: false,
    });

    const res = await verifyAuthToken('valid_token', 'recovery');
    expect(res.valid).toBe(true);
    expect(res.verification?.identifier).toBe('test@example.com');
  });

  it('returns valid false when token is expired', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60);
    mockFindOne.mockResolvedValueOnce({
      token: 'expired_token',
      identifier: 'test@example.com',
      type: 'recovery',
      expiresAt: pastDate,
      used: false,
    });

    const res = await verifyAuthToken('expired_token', 'recovery');
    expect(res.valid).toBe(false);
    expect(res.error).toBe('Token has expired');
  });
});

describe('issueAuthConfirmLink', () => {
  it('generates token and returns confirm link with options', async () => {
    const issued = await issueAuthConfirmLink({
      type: 'invite',
      email: 'officer@unit.mil',
      next: '/accept-invite',
      data: { role: 'user', unit_id: 'unit-1' },
      baseUrl: 'https://mess-manager.com',
    });

    expect(issued.error).toBeNull();
    expect(issued.token).toBeDefined();
    expect(issued.email).toBe('officer@unit.mil');
    expect(issued.link?.startsWith('https://mess-manager.com/auth/confirm?')).toBe(true);
    expect(mockInsertOne).toHaveBeenCalled();
  });
});
