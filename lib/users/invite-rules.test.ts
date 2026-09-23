import { describe, expect, it } from 'vitest';
import { inviteUserSchema, updateUserSchema } from '@/lib/schemas/users';
import { opsInviteBlock } from './invite-rules';

const UNIT = '11111111-1111-4111-8111-111111111111';

describe('opsInviteBlock', () => {
  it('refuses super_admin and unit_admin', () => {
    expect(opsInviteBlock('super_admin')).toMatch(/admin console/);
    expect(opsInviteBlock('unit_admin')).toMatch(/admin console/);
  });

  it('allows ops roles, including mess_secretary', () => {
    for (const role of ['mess_secretary', 'mess_havildar', 'bar_nco', 'property_nco', 'user', 'manager']) {
      expect(opsInviteBlock(role)).toBeNull();
    }
  });
});

describe('inviteUserSchema', () => {
  it('requires a unit for every invite', () => {
    const missing = inviteUserSchema.safeParse({ email: 'a@unit.test', role: 'mess_secretary' });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.some((issue) => issue.message === 'A unit is required')).toBe(true);
    }
    expect(inviteUserSchema.safeParse({
      email: 'a@unit.test',
      role: 'mess_secretary',
      unit_id: UNIT,
    }).success).toBe(true);
  });

  it('does not rewrite admin to super_admin', () => {
    const parsed = inviteUserSchema.safeParse({
      email: 'a@unit.test',
      role: 'admin',
      unit_id: UNIT,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('rejects a blank unit', () => {
    expect(updateUserSchema.safeParse({ unit_id: null }).success).toBe(false);
    expect(updateUserSchema.safeParse({ full_name: 'Ada' }).success).toBe(true);
  });
});
