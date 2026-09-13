'use client';

import { useCallback } from 'react';
import { LOGOUT_PATH, SESSION_CHANNEL, type SessionLogoutMessage } from './contract';

/**
 * The `at` of the last sign-out this document broadcast.
 *
 * BroadcastChannel delivers a message to every *other* channel object with the
 * same name — and that includes the one SessionSync holds in this same page.
 * Without this, the page that starts a sign-out hears its own message and
 * navigates to the signed-out page, cancelling its own form POST before the
 * browser can follow the logout response's redirect. With LOGOUT_MODE=full that
 * redirect is the trip to Entra, so Entra's session would silently survive.
 */
let lastBroadcastAt: number | null = null;

/** True if this document sent `message`. SessionSync uses it to ignore its own broadcast. */
export function isOwnBroadcast(message: SessionLogoutMessage): boolean {
  return message.at === lastBroadcastAt;
}

/**
 * Tells every other tab on this origin that the user is signing out.
 *
 * Fire-and-forget and synchronous: `postMessage` queues the message before this
 * returns, so it is safe to navigate away immediately afterwards.
 */
export function broadcastLogout(): void {
  if (typeof BroadcastChannel === 'undefined') return;

  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    const message: SessionLogoutMessage = { type: 'logout', at: Date.now() };
    lastBroadcastAt = message.at;
    channel.postMessage(message);
    channel.close();
  } catch {
    // Never let a failed broadcast block the actual sign-out.
  }
}

/**
 * Navigates to the logout endpoint via a real form POST.
 *
 * It has to be a POST: `/api/auth/logout` mutates state and therefore goes
 * through the same-origin check in apps/bff/lib/csrf.ts. A form submission
 * carries `Sec-Fetch-Site: same-origin` and an `Origin` header, so it passes.
 * `window.location.assign()` would issue a GET and get a 405.
 *
 * It has to be a *navigation* rather than `fetch()`: the response carries
 * `Clear-Site-Data`, which the browser applies to the document context. A
 * background fetch would clear storage but leave the current page sitting
 * there, still rendering a signed-in view.
 *
 * The action is a plain string, so Next's `basePath` does not rewrite it — a
 * button inside the handbook app still posts to the BFF's /api/auth/logout,
 * not /handbook/api/auth/logout.
 */
function navigateToLogout(): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = LOGOUT_PATH;
  form.hidden = true;
  document.body.appendChild(form);
  form.submit();
}

/**
 * Returns a function that signs the user out everywhere it can reach.
 *
 * Prefer `<LogoutButton />` for a normal button — it does the same thing with a
 * real form, so it still works if the page's JavaScript hasn't loaded. Reach
 * for this hook when sign-out is triggered by something other than a click: an
 * idle timer, a keyboard shortcut, a failed request handler.
 */
export function useLogout(): () => void {
  return useCallback(() => {
    broadcastLogout();
    navigateToLogout();
  }, []);
}
