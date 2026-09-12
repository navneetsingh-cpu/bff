/**
 * Origin-based CSRF defence. No token, no hidden field, no per-form state:
 * every state-changing request must prove it came from this origin.
 *
 * Pure and dependency-free so it runs unchanged in middleware (Edge) and in
 * Route Handlers (Node).
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Paths that must stay reachable cross-origin — the OIDC redirect lands here. */
const EXEMPT_PATHS = ['/api/auth/callback'];

function requestHost(req: Request): string | null {
  const headers = req.headers;
  // Behind a proxy the original host survives in X-Forwarded-Host.
  return headers.get('x-forwarded-host') ?? headers.get('host');
}

export function isCsrfSafe(req: Request, pathname: string): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  if (EXEMPT_PATHS.includes(pathname)) return true;

  // Sent by every current browser; the cheapest and most reliable signal.
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin') return true;
  if (fetchSite !== null) return false;

  // Fallback for clients that don't send Sec-Fetch-* (older browsers, curl).
  const origin = req.headers.get('origin');
  const host = requestHost(req);
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
