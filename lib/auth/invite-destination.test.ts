import { describe, expect, it } from 'vitest';
import { inviteLinkBaseUrl } from './invite-destination';

const OPS = 'https://ops.example.test';

describe('inviteLinkBaseUrl', () => {
  it('keeps super_admin and unit_admin on this app', () => {
    expect(inviteLinkBaseUrl('super_admin', undefined)).toEqual({});
    expect(inviteLinkBaseUrl('unit_admin', OPS)).toEqual({});
  });

  it('sends mess_secretary and every other ops role to mess-manager for invite and recovery', () => {
    for (const role of ['mess_secretary', 'mess_havildar', 'bar_nco', 'property_nco', 'user', 'manager']) {
      expect(inviteLinkBaseUrl(role, OPS)).toEqual({ baseUrl: OPS });
    }
  });

  it('fails the invite when the ops app URL is missing', () => {
    expect(inviteLinkBaseUrl('mess_secretary', undefined)).toEqual({
      error: 'NEXT_PUBLIC_OPS_APP_URL is not set',
    });
    expect(inviteLinkBaseUrl('user', '   ')).toEqual({
      error: 'NEXT_PUBLIC_OPS_APP_URL is not set',
    });
  });
});
