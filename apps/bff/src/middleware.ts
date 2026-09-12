import { NextResponse, type NextRequest } from 'next/server'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function nonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

function buildCsp(cspNonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${cspNonce}' 'strict-dynamic' https:`,
    `style-src 'self' 'nonce-${cspNonce}'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self' https://login.microsoftonline.com`,
    `frame-ancestors 'none'`,
    `form-action 'self' https://login.microsoftonline.com`,
    `base-uri 'none'`,
    `object-src 'none'`,
  ].join('; ')
}

/**
 * Double-guard CSRF: a same-origin Sec-Fetch-Site is enough on modern browsers,
 * otherwise the Origin header must match our own. Requests carrying neither are
 * rejected rather than trusted.
 */
function csrfOk(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return true

  const site = req.headers.get('sec-fetch-site')
  if (site === 'same-origin') return true
  if (site && site !== 'none') return false

  const origin = req.headers.get('origin')
  if (!origin) return false
  const expected = process.env.BFF_PUBLIC_ORIGIN ?? req.nextUrl.origin
  try {
    return new URL(origin).origin === new URL(expected).origin
  } catch {
    return false
  }
}

function withSecurityHeaders(res: NextResponse, csp: string): NextResponse {
  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  return res
}

export function middleware(req: NextRequest) {
  const cspNonce = nonce()
  const csp = buildCsp(cspNonce)

  if (!csrfOk(req)) {
    return withSecurityHeaders(new NextResponse('CSRF check failed', { status: 403 }), csp)
  }

  // Next reads the nonce off the request-side CSP header to stamp its own
  // bundles; x-nonce is what our own components read.
  const headers = new Headers(req.headers)
  headers.set('x-nonce', cspNonce)
  headers.set('content-security-policy', csp)

  return withSecurityHeaders(NextResponse.next({ request: { headers } }), csp)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
