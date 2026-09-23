import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildAuthConfirmLink, issueAuthConfirmLink } from './email-links';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mess-manager.com');
});

describe('buildAuthConfirmLink', () => {
  it('builds a first-party confirm URL from the hashed token', () => {
    const link = buildAuthConfirmLink({
      type: 'recovery',
      hashedToken: 'hashed token',
      next: '/reset-password',
    });
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe('https://mess-manager.com/auth/confirm');
    expect(url.searchParams.get('token_hash')).toBe('hashed token');
    expect(url.searchParams.get('type')).toBe('recovery');
    expect(url.searchParams.get('next')).toBe('/reset-password');
    expect(url.hash).toBe('');
  });

  it('uses baseUrl when the link must open in the other app', () => {
    const link = buildAuthConfirmLink({
      type: 'invite',
      hashedToken: 'tok',
      next: '/accept-invite',
      baseUrl: 'https://mess-manager.com',
    });
    expect(link.startsWith('https://mess-manager.com/auth/confirm?')).toBe(true);
  });
});

describe('issueAuthConfirmLink', () => {
  it('returns the confirm link when generateLink yields a hashed token', async () => {
    const generateLink = vi.fn(async () => ({
      data: {
        user: { id: 'user-1', email: 'officer@unit.mil' },
        properties: { hashed_token: 'abc' },
      },
      error: null,
    }));
    const issued = await issueAuthConfirmLink(
      { auth: { admin: { generateLink } } },
      {
        type: 'invite',
        email: 'officer@unit.mil',
        next: '/accept-invite',
        data: { role: 'user', unit_id: 'unit-1' },
      },
    );

    expect(generateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: 'officer@unit.mil',
      options: { data: { role: 'user', unit_id: 'unit-1' } },
    });
    expect(issued.error).toBeNull();
    expect(issued.userId).toBe('user-1');
    expect(issued.link).toContain('token_hash=abc');
    expect(issued.link).toContain('type=invite');
  });

  it('returns no link when generateLink fails', async () => {
    const issued = await issueAuthConfirmLink(
      {
        auth: {
          admin: {
            generateLink: async () => ({
              data: null,
              error: { message: 'already registered' },
            }),
          },
        },
      },
      { type: 'recovery', email: 'officer@unit.mil', next: '/reset-password' },
    );
    expect(issued.link).toBeNull();
    expect(issued.error?.message).toBe('already registered');
  });
});
