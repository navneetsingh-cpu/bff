import { NextResponse, type NextRequest } from 'next/server';
import {
  INTERNAL_ASSERTION_HEADER,
  mintInternalAssertion,
  stripUntrustedHeaders,
  type InternalAudience,
} from '@bff/internal-auth';
import { internalJwtIssuer, internalJwtSecret, internalJwtTtlSeconds } from './env';
import { readSessionId } from './cookies';
import { touchSession } from './session';
import { upstreamFor } from './upstreams';
import { publicOrigin } from './redirects';

/**
 * Hop-by-hop headers plus the ones fetch() must compute for itself. Forwarding
 * a stale content-length or an inbound transfer-encoding corrupts the request.
 */
const REQUEST_HEADERS_TO_DROP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  // Sub-apps must not see the BFF session cookie. Identity arrives one way only.
  'cookie',
];

/**
 * fetch() decodes the upstream body, so the encoding and length headers it came
 * with no longer describe what we're about to send. Set-Cookie is dropped
 * because only the BFF gets to own cookies on this origin.
 */
const RESPONSE_HEADERS_TO_DROP = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'set-cookie',
];

function wantsHtml(req: NextRequest): boolean {
  return (req.headers.get('accept') ?? '').includes('text/html');
}

/**
 * Proxies a request to one of the sub-apps.
 *
 * The security-relevant sequence, in order:
 *   1. Resolve the session from the opaque sid cookie. No session, no proxy.
 *   2. Delete every inbound X-Internal-* / X-User-* header, so nothing a client
 *      sent can survive into the upstream request.
 *   3. Mint a fresh 60s assertion scoped to this one sub-app and attach it.
 */
export async function proxyToSubApp(req: NextRequest, audience: InternalAudience): Promise<Response> {
  const upstream = upstreamFor(audience);

  const session = await touchSession(readSessionId(req));
  if (!session) {
    if (wantsHtml(req)) {
      const loginUrl = new URL('/api/auth/login', publicOrigin(req));
      loginUrl.searchParams.set('returnTo', req.nextUrl.pathname + req.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // The sub-app serves everything under its own basePath, which is the same
  // prefix we route on, so the path passes through unchanged.
  const targetUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, upstream.origin);

  const headers = stripUntrustedHeaders(req.headers);
  for (const name of REQUEST_HEADERS_TO_DROP) headers.delete(name);

  const assertion = await mintInternalAssertion({
    secret: internalJwtSecret(),
    issuer: internalJwtIssuer(),
    ttlSeconds: internalJwtTtlSeconds(),
    audience,
    subject: session.userId,
    email: session.email,
    name: session.name,
    roles: session.roles,
  });

  headers.set(INTERNAL_ASSERTION_HEADER, assertion);
  // Let the sub-app build absolute URLs that point back at the BFF, not at itself.
  headers.set('x-forwarded-host', req.headers.get('host') ?? req.nextUrl.host);
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));

  const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // Required by undici whenever a stream is used as the request body.
      ...(hasBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
      cache: 'no-store',
    } as RequestInit);
  } catch (error) {
    console.error(`[proxy] ${audience} unreachable:`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'upstream_unavailable', app: audience }, { status: 502 });
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  for (const name of RESPONSE_HEADERS_TO_DROP) responseHeaders.delete(name);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
