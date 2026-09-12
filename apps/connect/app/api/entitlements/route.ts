import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { verifyRequestIdentity } from '@/lib/identity';
import { getEntitlements } from '@/lib/entitlements';

/**
 * Node, not edge. `lib/entitlements` uses axios and a module-level Map; the
 * edge runtime gives neither a stable process to cache in nor node's http stack.
 */
export const runtime = 'nodejs';

/**
 * Never cached. The answer is per-user and changes when entitlements change —
 * a cached response here would be one user's permissions served to another.
 */
export const dynamic = 'force-dynamic';

/**
 * GET /connect/api/entitlements
 *
 * The `/connect` prefix is not in this file. It comes from `basePath` in
 * next.config.js, which is also the path the BFF proxies — so the route lives
 * at `app/api/entitlements` here and answers at `/connect/api/entitlements`
 * in the browser, with nothing rewriting the path in between.
 *
 * Middleware has already verified the assertion before this runs. It is
 * verified again here, deliberately: this handler must not depend on an
 * upstream having done it, and re-verifying costs one HMAC.
 */
export async function GET() {
  const result = await verifyRequestIdentity(headers());

  if (!result.ok) {
    // Flat 401, no reason. A caller probing this endpoint learns that it was
    // rejected and nothing more.
    console.warn(`[connect] entitlements rejected: ${result.reason}`);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Identity comes from the verified claims and only from there. No reading a
  // userId out of a query parameter, a body, or an X-User-* header — those are
  // all caller-controlled, which is the whole reason the assertion exists.
  const entitlements = await getEntitlements(result.claims);

  return NextResponse.json(entitlements, {
    headers: { 'cache-control': 'no-store' },
  });
}
