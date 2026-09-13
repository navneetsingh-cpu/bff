/**
 * Shared identity shapes. The BFF owns the session; sub-apps only ever see the
 * subset of it that travels inside a signed internal assertion.
 */

/** What the BFF keeps in Redis for a logged-in session. */
export interface SessionRecord {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  /** Epoch milliseconds. Fixed at login; drives the absolute session cap. */
  createdAt: number;
  /** Epoch milliseconds. Bumped on every request; drives the idle timeout. */
  lastSeenAt: number;
  /**
   * The raw Entra ID token. Only stored when AUTH_MODE=oidc and
   * LOGOUT_MODE=full, where sign-out sends it back to Entra as `id_token_hint`.
   * It never leaves the BFF: nothing forwards the whole record, and it is not
   * part of the internal assertion.
   */
  idToken?: string;
}

/** The identity a sub-app is allowed to act on, after verifying the assertion. */
export interface VerifiedIdentity {
  sub: string;
  email: string;
  name: string;
  roles: string[];
}

/** Full decoded claim set of an internal assertion. */
export interface InternalAssertionClaims extends VerifiedIdentity {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

/** Audiences the BFF is allowed to mint assertions for. */
export type InternalAudience = 'connect' | 'iif' | 'handbook';
