import { describe, expect, it } from 'vitest';
import { signInSchema } from './auth';

describe('password schemas', () => {
  it('requires an 8 character minimum for sign-in', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'longenough' }).success).toBe(true);
  });
});
