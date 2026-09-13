import type { NextRequest } from 'next/server';
import type { SessionRecord } from '@bff/internal-auth';
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
   * been destroyed and the cookie cleared. `session` is the record as it was
   * just before the DEL, or null if there wasn't one.
   *
   * stub — straight to the confirmation page, there is nothing else to tell.
   *        LOGOUT_MODE is ignored.
   * oidc — decided by LOGOUT_MODE. `local` goes straight to the confirmation
   *        page and leaves the Entra session alone. `full` goes via Entra's
   *        end_session_endpoint, with the stored ID token as id_token_hint, so
   *        the next sign-in asks for credentials.
   *
   * This is where LOGOUT_MODE is read, rather than in the route, so the route
   * still never branches on AUTH_MODE.
   *
   * Must never throw: the local session is already gone by the time this is
   * called, so a failure here has to degrade to the confirmation page rather
   * than leave the user on an error with no session and no explanation.
   */
  buildLogoutRedirect(req: NextRequest, session: SessionRecord | null): Promise<string>;
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
