import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { env, scopes } from '@/lib/env'
import { cryptoProvider, msalForSession } from '@/lib/msal'
import { clientIdentity, rateLimit } from '@/lib/ratelimit'
import { opaqueId } from '@/lib/crypto'
import { saveAuthTx, setAuthTxCookie } from '@/lib/session'
import { safeReturnTo } from '@/lib/sso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Query = z.object({
  returnTo: z.string().optional(),
  loginHint: z.string().email().optional(),
})

export async function GET(req: NextRequest) {
  const limit = await rateLimit('auth-login', clientIdentity(req), 20, 60)
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

  const returnTo = safeReturnTo(query.data.returnTo)
  const { codeVerifier, challenge } = await cryptoProvider.generatePkceCodes()
  const state = opaqueId()
  const nonce = opaqueId()

  await saveAuthTx(state, { codeVerifier, nonce, returnTo })

  const { cca } = msalForSession()
  const authUrl = await cca.getAuthCodeUrl({
    scopes: scopes(),
    redirectUri: env().REDIRECT_URI,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    state,
    nonce,
    loginHint: query.data.loginHint,
  })

  const res = NextResponse.redirect(authUrl, 302)
  setAuthTxCookie(res, state)
  return res
}
