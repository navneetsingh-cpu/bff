'use client';

import { useEffect } from 'react';
import { LOGGED_OUT_PATH, SESSION_CHANNEL, isLogoutMessage } from './contract';

/**
 * Listens for a sign-out that happened in another tab and follows it.
 *
 * Mount once, in each app's root layout. It renders nothing.
 *
 * Scope, stated plainly: BroadcastChannel reaches other tabs and windows **in
 * the same browser profile, on the same origin**. It does not reach a different
 * browser, a different device, an incognito window, or another origin. Making
 * sign-out propagate to those needs a server push — see the TODO in
 * apps/bff/lib/session.ts.
 *
 * This is convenience, not enforcement. The session is already dead server-side
 * by the time this message arrives; all a stale tab can do is show stale pixels
 * until its next request 401s. This just stops it looking signed in.
 */
export function SessionSync() {
  useEffect(() => {
    // Older Safari and some embedded webviews have no BroadcastChannel. The
    // feature simply doesn't exist there; everything else still works.
    if (typeof BroadcastChannel === 'undefined') return;

    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(SESSION_CHANNEL);
    } catch {
      // Some privacy modes expose the constructor but throw on use.
      return;
    }

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!isLogoutMessage(event.data)) return;

      // Already on the confirmation page — redirecting again would loop.
      if (window.location.pathname === LOGGED_OUT_PATH) return;

      // replace(), not assign(): the page behind us belongs to a session that
      // no longer exists, so it should not be reachable with the back button.
      window.location.replace(LOGGED_OUT_PATH);
    };

    return () => channel.close();
  }, []);

  return null;
}
