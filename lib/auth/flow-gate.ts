// Confinement gate for partially-trusted email-link sessions.
// No 'server-only': proxy.ts imports these constants.

/**
 * Set by /auth/confirm when a recovery or invite link creates a session.
 * While present, proxy.ts confines the session to the cookie's path until
 * the flow completes (password set / invite accepted), which clears it.
 * Prevents a failed or abandoned password reset from leaving a fully
 * usable authenticated session.
 */
export const AUTH_FLOW_GATE_COOKIE = 'om-flow-gate';

/** Allow-list of paths the gate cookie may confine to (anti-tampering). */
export const AUTH_FLOW_GATE_PATHS = ['/reset-password', '/accept-invite'] as const;

export type AuthFlowGatePath = (typeof AUTH_FLOW_GATE_PATHS)[number];

export function isGatePath(value: string): value is AuthFlowGatePath {
  return (AUTH_FLOW_GATE_PATHS as readonly string[]).includes(value);
}

/** 30 minutes — matches the practical lifetime of a reset attempt. */
export const AUTH_FLOW_GATE_MAX_AGE = 60 * 30;
