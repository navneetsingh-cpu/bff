import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { env, scopes } from '@/lib/env'
import { claimsFromResult, msalForSession } from '@/lib/msal'
import { clientIdentity, rateLimit } from '@/lib/ratelimit'
import { safeEqual } from '@/lib/crypto'
import {
  AUTHTX_COOKIE,
  SESSION_COOKIE,
  clearAuthTxCookie,
  createSession,
  destroySession,
  setSessionCookie,
  takeAuthTx,
} from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Callback = z
  .object({
    code: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  })
  .refine((v) => Boolean(v.error) || (Boolean(v.code) && Boolean(v.state)), {
    message: 'code and state are required',
  })

export async function GET(req: NextRequest) {
  const limit = await rateLimit('auth-callback', clientIdentity(req), 20, 60)
  if (!limit.ok) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSeconds) },
    })
  }

  const parsed = Callback.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (parsed.data.error) {
    return NextResponse.json({ error: parsed.data.error }, { status: 400 })
  }

  const state = parsed.data.state!
  const boundState = req.cookies.get(AUTHTX_COOKIE)?.value
  if (!boundState || !safeEqual(boundState, state)) {
    return NextResponse.json({ error: 'state_mismatch' }, { status: 400 })
  }

  const tx = await takeAuthTx(state)
  if (!tx) {
    return NextResponse.json({ error: 'unknown_state' }, { status: 400 })
  }

  const { cca, snapshot } = msalForSession()
  let result
  try {
    result = await cca.acquireTokenByCode({
      code: parsed.data.code!,
      scopes: scopes(),
      redirectUri: env().REDIRECT_URI,
      codeVerifier: tx.codeVerifier,
      state,
    })
  } catch {
    return NextResponse.json({ error: 'token_exchange_failed' }, { status: 502 })
  }

  if ((result.idTokenClaims as { nonce?: string } | undefined)?.nonce !== tx.nonce) {
    return NextResponse.json({ error: 'nonce_mismatch' }, { status: 400 })
  }
  if (!result.account) {
    return NextResponse.json({ error: 'no_account' }, { status: 502 })
  }

  // Rotate: any pre-login session id is discarded, never reused.
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value)

  const sid = await createSession({
    homeAccountId: result.account.homeAccountId,
    claims: claimsFromResult(result),
    tokenCache: snapshot(),
  })

  const res = NextResponse.redirect(new URL(tx.returnTo, req.nextUrl.origin), 302)
  setSessionCookie(res, sid)
  clearAuthTxCookie(res)
  return res
}
