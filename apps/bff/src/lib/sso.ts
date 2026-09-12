import { z } from 'zod'
import { env } from './env'
import type { SessionClaims } from './session'

/**
 * Only same-site relative paths are accepted. Rejects protocol-relative URLs,
 * backslash tricks and anything with a scheme or authority.
 */
export const ReturnTo = z
  .string()
  .max(512)
  .refine(
    (v) =>
      v.startsWith('/') &&
      !v.startsWith('//') &&
      !v.startsWith('/\') &&
      !v.includes('\') &&
      !/^\/+[^/]*:/.test(v),
    { message: 'returnTo must be a relative path' },
  )

export function safeReturnTo(value: unknown, fallback = '/'): string {
  const parsed = ReturnTo.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

/**
 * Handoff to a separately hosted MSAL SPA: carries login_hint so the SPA can go
 * straight to ssoSilent instead of prompting. The SPA base URL is taken from
 * configuration, never from the request.
 */
export function buildSsoLink(spaBaseUrl: string | undefined, claims: SessionClaims, returnTo = '/'): string | null {
  const base = spaBaseUrl ?? env().SPA_BASE_URL
  if (!base) return null
  const url = new URL(base)
  if (claims.loginHint) url.searchParams.set('login_hint', claims.loginHint)
  url.searchParams.set('returnTo', safeReturnTo(returnTo))
  return url.toString()
}
