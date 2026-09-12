import { NextResponse, type NextRequest } from 'next/server';
import { LOGGED_OUT_PATH } from '@bff/session-sync/contract';
import { verifyRequestIdentity } from './lib/identity';

/** A page navigation, as opposed to an asset or an XHR. */
function isDocumentRequest(req: NextRequest): boolean {
  if (req.headers.get('sec-fetch-mode') === 'navigate') return true;
  return (req.headers.get('accept') ?? '').includes('text/html');
}

/**
 * Builds an absolute URL back to the BFF's sign-out page.
 *
 * This app's own origin is `http://handbook:3000` — a container name that means
 * nothing in a browser — so the public host has to come from the
 * `X-Forwarded-*` headers the proxy set. Those headers are only present on a
 * request that actually came through the BFF; a request that reached this
 * container some other way gets a flat 401 instead, which also means this can
 * never be turned into an open redirect by a forged Host.
 */
function loggedOutUrl(req: NextRequest): string | null {
  const host = req.headers.get('x-forwarded-host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';

  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  if (proto !== 'http' && proto !== 'https') return null;

  return `${proto}://${host}${LOGGED_OUT_PATH}`;
}

/**
 * The gate. Nothing in this app renders until the internal assertion verifies:
 * signature, issuer, audience and expiry all have to hold.
 *
 * Failures carry no detail — a caller probing this app directly learns only
 * that it was rejected, not why.
 */
export async function middleware(req: NextRequest) {
  const result = await verifyRequestIdentity(req.headers);

  if (!result.ok) {
    console.warn(`[handbook] rejected ${req.method} ${req.nextUrl.pathname}: ${result.reason}`);

    // Most often this means the session was destroyed while the tab was open.
    // A bare 401 body would leave the user looking at raw JSON with no way
    // forward, so send navigations to the page that explains what happened.
    // Assets and XHRs still get the 401 they can actually handle.
    const target = isDocumentRequest(req) ? loggedOutUrl(req) : null;
    if (target) return NextResponse.redirect(target, { status: 303 });

    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const res = NextResponse.next();
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('x-frame-options', 'DENY');
  return res;
}

export const config = {
  // Deliberately includes _next/static: these assets are only ever fetched
  // through the BFF, which mints an assertion for every request.
  matcher: ['/((?!favicon.ico).*)'],
};
