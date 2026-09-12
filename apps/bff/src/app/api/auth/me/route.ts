import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { clientIdentity, rateLimit } from '@/lib/ratelimit'
import { SESSION_COOKIE, getSession } from '@/lib/session'
import { buildSsoLink, safeReturnTo } from '@/lib/sso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Query = z.object({ returnTo: z.string().optional() })

export async function GET(req: NextRequest) {
  const limit = await rateLimit('auth-me', clientIdentity(req), 60, 60)
  if (!limit.ok) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSeconds) },
    })
  }

  const query = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!query.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const session = await getSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const returnTo = safeReturnTo(query.data.returnTo)
  return NextResponse.json(
    {
      authenticated: true,
      user: {
        sub: session.claims.sub,
        oid: session.claims.oid,
        name: session.claims.name,
        roles: session.claims.roles,
      },
      absoluteExpiresAt: session.absoluteExpiresAt,
      ssoLink: buildSsoLink(undefined, session.claims, returnTo),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
