import type { NextRequest } from 'next/server';
import { authMode, type AuthMode } from '../env';

/**
 * Both auth modes implement the same three entry points, so the route handlers
 * never branch on AUTH_MODE themselves.
 *
 *   stub — startLogin renders a picker, submitLogin creates the session.
 *   oidc — startLogin redirects to Entra, handleCallback creates the session.
 *
 * The unused half of each pair returns 405 rather than silently succeeding.
 */
export interface AuthProvider {
  readonly mode: AuthMode;
  /** GET /api/auth/login */
  startLogin(req: NextRequest): Promise<Response>;
  /** POST /api/auth/login */
  submitLogin(req: NextRequest): Promise<Response>;
  /** GET /api/auth/callback */
  handleCallback(req: NextRequest): Promise<Response>;
  /**
   * Absolute URL to send the browser to *after* the local session has already
   * been destroyed and the cookie cleared.
   *
   * stub — straight to the confirmation page, there is nothing else to tell.
   * oidc — the identity provider's end_session_endpoint, so the user is signed
   *        out of Entra too and not silently signed back in on the next login.
   *
   * Must never throw: the local session is already gone by the time this is
   * called, so a failure here has to degrade to the confirmation page rather
   * than leave the user on an error with no session and no explanation.
   */
  buildLogoutRedirect(req: NextRequest): Promise<string>;
}

export async function getAuthProvider(): Promise<AuthProvider> {
  // Dynamic import so the OIDC client (and its Node-only deps) is never loaded
  // in stub mode, and vice versa.
  if (authMode() === 'oidc') {
    const { oidcProvider } = await import('./oidc');
    return oidcProvider;
  }
  const { stubProvider } = await import('./stub');
  return stubProvider;
}
