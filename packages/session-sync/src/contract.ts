/**
 * The shared vocabulary for signing out: one channel name, two URLs, one
 * message shape.
 *
 * This module has **zero imports** on purpose. It is reachable from the Edge
 * runtime (sub-app middleware imports it to build the redirect target) as well
 * as from client components, so it must not pull in React, `jose`, or anything
 * else. Import it as `@bff/session-sync/contract` from server code; the root
 * entry point re-exports it for client code.
 */

/**
 * BroadcastChannel name. BroadcastChannel is scoped to an origin, and all four
 * apps are served from the BFF's single origin, so a tab showing /handbook and
 * a tab showing /connect are on the same channel.
 */
export const SESSION_CHANNEL = 'session';

/** POST here to destroy the session. Never GET — it mutates state. */
export const LOGOUT_PATH = '/api/auth/logout';

/** Public confirmation page. Safe to land on with no session. */
export const LOGGED_OUT_PATH = '/api/auth/logged-out';

/** Where the "sign in again" link goes. */
export const LOGIN_PATH = '/api/auth/login';

/**
 * The only message that travels on the channel today.
 *
 * `at` is not used for anything yet. It is here so that when a server-pushed
 * event stream is added (see the TODO in apps/bff/lib/session.ts), a tab can
 * tell a locally-broadcast logout from a server one that may have been queued
 * behind a reconnect, and ignore the older of the two.
 */
export interface SessionLogoutMessage {
  type: 'logout';
  at: number;
}

/**
 * Messages arrive from other tabs, so treat them as untrusted input even though
 * BroadcastChannel is same-origin only — a compromised tab is exactly the case
 * where the channel carries something unexpected.
 */
export function isLogoutMessage(value: unknown): value is SessionLogoutMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return message.type === 'logout' && typeof message.at === 'number';
}
