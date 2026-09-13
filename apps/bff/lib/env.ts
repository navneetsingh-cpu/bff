/**
 * Runtime configuration. Read lazily via getters so a missing variable fails on
 * the request that needs it, not at module load — which would take the whole
 * server down (including /api/health) over an unrelated feature.
 */

export type AuthMode = 'stub' | 'oidc';

function read(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

export function authMode(): AuthMode {
  const mode = read('AUTH_MODE', 'stub');
  if (mode !== 'stub' && mode !== 'oidc') {
    throw new Error(`AUTH_MODE must be 'stub' or 'oidc', got "${mode}"`);
  }
  return mode;
}

/**
 * Cookie name is configurable so local dev can use a plain `sid` over HTTP while
 * production uses `__Host-sid`, whose prefix the browser only honours when the
 * cookie is Secure, Path=/ and has no Domain.
 */
export const sessionCookieName = (): string => read('SESSION_COOKIE_NAME', 'sid');

export type LogoutMode = 'local' | 'full';

/**
 * What "Sign out" ends. Only read when AUTH_MODE=oidc — stub mode has no
 * identity-provider session, so it never calls this.
 *
 *   local — this app's session only. The user stays signed in to Entra, and so
 *           to every other Microsoft app in the browser.
 *   full  — this app's session, then Entra's via its end_session_endpoint.
 */
export function logoutMode(): LogoutMode {
  const mode = read('LOGOUT_MODE', 'local');
  if (mode !== 'local' && mode !== 'full') {
    throw new Error(`LOGOUT_MODE must be 'local' or 'full', got "${mode}"`);
  }
  return mode;
}

/**
 * Adds prompt=login to the authorize request. A dev/demo aid for showing the
 * sign-in flow repeatedly without ending the shared Entra session — not a
 * production setting.
 */
export function forceLoginPrompt(): boolean {
  const raw = read('FORCE_LOGIN_PROMPT', 'false');
  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`FORCE_LOGIN_PROMPT must be 'true' or 'false', got "${raw}"`);
  }
  return raw === 'true';
}

/** Sliding window: a session dies this long after the last request. */
export const sessionIdleSeconds = (): number => readInt('SESSION_IDLE_SECONDS', 30 * 60);

/** Hard ceiling: a session dies this long after login regardless of activity. */
export const sessionAbsoluteSeconds = (): number => readInt('SESSION_ABSOLUTE_SECONDS', 8 * 60 * 60);

export const redisUrl = (): string => read('REDIS_URL', 'redis://redis:6379');

export const internalJwtSecret = (): string => read('INTERNAL_JWT_SECRET');

export const internalJwtIssuer = (): string => read('INTERNAL_JWT_ISSUER', 'bff');

export const internalJwtTtlSeconds = (): number => readInt('INTERNAL_JWT_TTL_SECONDS', 60);

export const azure = () => ({
  tenantId: read('AZURE_TENANT_ID'),
  clientId: read('AZURE_CLIENT_ID'),
  clientSecret: read('AZURE_CLIENT_SECRET'),
  redirectUri: read('REDIRECT_URI'),
  scope: read('OIDC_SCOPE', 'openid profile email'),
});
