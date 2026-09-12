import { NextResponse, type NextRequest } from 'next/server';
import { verifyRequestIdentity } from './lib/identity';

/**
 * The gate. Nothing in this app renders until the internal assertion verifies:
 * signature, issuer, audience and expiry all have to hold.
 *
 * Failures are a flat 401 with no detail — a caller probing this app directly
 * learns only that it was rejected, not why.
 */
export async function middleware(req: NextRequest) {
  const result = await verifyRequestIdentity(req.headers);

  if (!result.ok) {
    console.warn(`[handbook] rejected ${req.method} ${req.nextUrl.pathname}: ${result.reason}`);
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
