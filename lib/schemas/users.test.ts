import { describe, expect, it } from 'vitest';
import { inviteUserSchema, normalizeRoleAlias } from './users';
import { acceptInviteSchema, resetPasswordSchema, signInSchema } from './auth';

describe('normalizeRoleAlias', () => {
  it('maps the retired admin alias to super_admin', () => {
    expect(normalizeRoleAlias('admin')).toBe('super_admin');
    expect(normalizeRoleAlias('unit_admin')).toBe('unit_admin');
    expect(inviteUserSchema.parse({ email: 'a@b.co', role: 'admin' }).role).toBe('super_admin');
  });
});

describe('password schemas', () => {
  it('uses the same 8 character minimum for sign-in, reset, and accept-invite', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'short' }).success).toBe(false);
    expect(acceptInviteSchema.safeParse({ password: 'short' }).success).toBe(false);
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'longenough' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: 'longenough' }).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ password: 'longenough' }).success).toBe(true);
  });
});
