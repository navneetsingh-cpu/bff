import { NextResponse, type NextRequest } from 'next/server';
import { isCsrfSafe } from './lib/csrf';

/**
 * Runtime note: Next 14 runs middleware on the Edge runtime — `runtime: 'nodejs'`
 * for middleware only became configurable in Next 15 (experimental.nodeMiddleware).
 * Nothing in this file needs Node APIs: it uses WebCrypto for the nonce and
 * pure header logic for CSRF, so it will run unchanged on either runtime.
 *
 * The Node-only work — Redis session lookups and minting assertions — lives in
 * the proxy Route Handlers instead, which are already on the Node runtime. See
 * the comment at the top of next.config.js.
 */

/** Paths the BFF proxies to a sub-app. Their responses keep the sub-app's own CSP. */
const PROXIED_PREFIXES = ['/connect', '/iif', '/handbook'];

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * 'strict-dynamic' means the nonce is the only thing that matters: a script the
 * BFF nonces may load further scripts, and the host allowlist is ignored by
 * browsers that understand it. The `https:` and 'unsafe-inline' entries are
 * there purely as fallbacks for browsers that don't, and are ignored where
 * 'strict-dynamic' is supported.
 */
function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? // next dev compiles with eval-based source maps.
      `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

function applySecurityHeaders(headers: Headers): void {
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (!isCsrfSafe(req, pathname)) {
    return NextResponse.json(
      { error: 'csrf_rejected', detail: 'Cross-origin state-changing request.' },
      { status: 403 },
    );
  }

  const isProxied = PROXIED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProxied) {
    // Don't stamp the BFF's nonce onto a sub-app's HTML — its scripts carry a
    // different one (or none), and a mismatched nonce would break the page.
    const res = NextResponse.next();
    applySecurityHeaders(res.headers);
    return res;
  }

  const nonce = generateNonce();
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production');

  // Next reads the nonce back off the request's CSP header and stamps it onto
  // the script tags it generates, so this request header is load-bearing.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('content-security-policy', csp);
  applySecurityHeaders(res.headers);
  return res;
}

export const config = {
  matcher: [
    /*
     * Everything except the BFF's own build output and static files. Sub-app
     * assets live under /connect/_next/... and are intentionally still matched.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
