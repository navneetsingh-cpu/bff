import { NextResponse, type NextRequest } from 'next/server'
import { endSessionUrl } from '@/lib/msal'
import { clientIdentity, rateLimit } from '@/lib/ratelimit'
import { SESSION_COOKIE, clearSessionCookie, destroySession, getSession } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function endSession(req: NextRequest) {
  const sid = req.cookies.get(SESSION_COOKIE)?.value
  const session = await getSession(sid)
  await destroySession(sid)
  return session?.claims.loginHint
}

/** App-initiated logout. CSRF is enforced by middleware for non-GET methods. */
export async function POST(req: NextRequest) {
  const limit = await rateLimit('auth-logout', clientIdentity(req), 20, 60)
  if (!limit.ok) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSeconds) },
    })
  }

  const loginHint = await endSession(req)
  const res = NextResponse.json({ logoutUrl: endSessionUrl(loginHint) })
  clearSessionCookie(res)
  return res
}

/**
 * Front-channel logout endpoint registered in Entra. Entra loads it in a hidden
 * iframe when the user signs out elsewhere; the CSP frame-ancestors 'none' blocks
 * rendering, but the request still reaches us and the session is destroyed.
 */
export async function GET(req: NextRequest) {
  await endSession(req)
  const res = new NextResponse(null, { status: 204 })
  clearSessionCookie(res)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
