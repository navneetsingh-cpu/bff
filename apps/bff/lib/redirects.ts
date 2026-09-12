import type { NextRequest } from 'next/server';

/**
 * Only ever redirect to a path on this origin. `//evil.example` and
 * `https://evil.example` are both rejected — an open redirect on the login
 * endpoint is a phishing primitive.
 */
export function safeReturnTo(candidate: string | null | undefined, fallback = '/'): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//')) return fallback;
  if (candidate.startsWith('/\\')) return fallback;
  return candidate;
}

/**
 * The origin a browser actually used to reach us.
 *
 * `req.nextUrl.origin` cannot be trusted for this. Next's standalone server
 * builds absolute URLs from `HOSTNAME`, which has to be `0.0.0.0` for the
 * container to bind every interface — so every redirect built from it sends
 * the browser to `http://0.0.0.0:3000`, which resolves nowhere. `next dev`
 * binds localhost, which is why this only ever shows up in a container.
 *
 * Order of preference:
 *   1. `PUBLIC_ORIGIN` — authoritative, and the only option immune to a forged
 *      Host header. Set it in production.
 *   2. `X-Forwarded-Host` / `X-Forwarded-Proto` — what a TLS terminator sets.
 *   3. The `Host` header, which is correct for a directly-published container.
 *   4. `req.nextUrl.origin`, which at this point is the 0.0.0.0 case anyway.
 *
 * Steps 2 and 3 are client-controlled, so the host is pattern-checked before
 * use: without that, a forged Host would turn the post-login redirect into an
 * open redirect, which is a phishing primitive on an auth endpoint.
 */
export function publicOrigin(req: NextRequest): string {
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/+$/, '');

  // X-Forwarded-Host is a comma-separated list when proxies chain; the first
  // entry is what the client asked for.
  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwarded || req.headers.get('host')?.trim();

  if (host && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
      ?? req.nextUrl.protocol.replace(/:$/, '');
    if (proto === 'http' || proto === 'https') return `${proto}://${host}`;
  }

  return req.nextUrl.origin;
}
