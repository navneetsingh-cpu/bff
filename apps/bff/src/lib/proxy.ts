import { NextResponse, type NextRequest } from 'next/server'
import { INTERNAL_ASSERTION_HEADER, mintInternalAssertion, type InternalAudience } from '@internal/auth'
import { silentRefresh } from './msal'
import { getSession, SESSION_COOKIE, type Session } from './session'

const UPSTREAMS: Record<InternalAudience, string> = {
  'app-hr': process.env.APP_HR_ORIGIN ?? 'http://app-hr:3000',
  'app-ops': process.env.APP_OPS_ORIGIN ?? 'http://app-ops:3000',
}

const HOP_BY_HOP = new Set([
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
])

/**
 * Inbound headers are rebuilt rather than forwarded: anything a client could use
 * to impersonate identity (X-Internal-*, X-User-*) is dropped, and the session
 * cookie never leaves the BFF.
 */
function sanitizedHeaders(source: Headers): Headers {
  const out = new Headers()
  source.forEach((value, name) => {
    const key = name.toLowerCase()
    if (HOP_BY_HOP.has(key)) return
    if (key.startsWith('x-internal-') || key.startsWith('x-user-')) return
    if (key === 'cookie' || key === 'authorization') return
    out.set(name, value)
  })
  return out
}

function responseHeaders(source: Headers): Headers {
  const out = new Headers()
  source.forEach((value, name) => {
    const key = name.toLowerCase()
    if (HOP_BY_HOP.has(key)) return
    // fetch already decoded the body.
    if (key === 'content-encoding') return
    out.set(name, value)
  })
  return out
}

async function forward(
  req: NextRequest,
  audience: InternalAudience,
  session: Session,
  body: ArrayBuffer | undefined,
): Promise<Response> {
  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, UPSTREAMS[audience])
  const headers = sanitizedHeaders(req.headers)
  headers.set(
    INTERNAL_ASSERTION_HEADER,
    await mintInternalAssertion(
      { sub: session.claims.sub, oid: session.claims.oid, roles: session.claims.roles },
      audience,
    ),
  )
  headers.set('x-forwarded-host', req.nextUrl.host)
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''))

  return fetch(target, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
    cache: 'no-store',
  })
}

/**
 * Session-authenticated reverse proxy to one internal app. A downstream 401 is
 * retried once behind a server-side silent refresh.
 */
export async function proxyToApp(req: NextRequest, audience: InternalAudience): Promise<Response> {
  const sid = req.cookies.get(SESSION_COOKIE)?.value
  const session = await getSession(sid)
  if (!session) {
    const login = new URL('/api/auth/login', req.nextUrl.origin)
    login.searchParams.set('returnTo', req.nextUrl.pathname + req.nextUrl.search)
    // Browsers navigating get sent to login; anything else gets a plain 401.
    return req.headers.get('sec-fetch-mode') === 'navigate'
      ? NextResponse.redirect(login, 302)
      : new NextResponse('Unauthorized', { status: 401 })
  }

  const body =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer()

  let upstream = await forward(req, audience, session, body)

  if (upstream.status === 401) {
    const refreshed = await silentRefresh(session)
    if (refreshed) {
      upstream = await forward(req, audience, refreshed, body)
    }
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders(upstream.headers),
  })
}
