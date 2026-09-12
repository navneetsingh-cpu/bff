import type { NextResponse } from 'next/server'
import { z } from 'zod'
import { decrypt, encrypt, opaqueId } from './crypto'
import { env } from './env'
import { redis } from './redis'

const SESSION_PREFIX = 'sess:'
const AUTHTX_PREFIX = 'authtx:'
const AUTHTX_TTL_SECONDS = 600

/** __Host- requires Secure + Path=/ + no Domain, so it only works over HTTPS. */
export const SESSION_COOKIE = process.env.DEV_INSECURE_COOKIE === 'true' ? 'sid' : '__Host-sid'
export const AUTHTX_COOKIE = process.env.DEV_INSECURE_COOKIE === 'true' ? 'authtx' : '__Host-authtx'

export const SessionClaims = z.object({
  sub: z.string(),
  oid: z.string(),
  roles: z.array(z.string()).default([]),
  name: z.string().optional(),
  loginHint: z.string().optional(),
})
export type SessionClaims = z.infer<typeof SessionClaims>

const StoredSession = z.object({
  createdAt: z.number(),
  absoluteExpiresAt: z.number(),
  homeAccountId: z.string(),
  claims: SessionClaims,
  /** AES-256-GCM blob holding the serialized MSAL token cache. */
  tokens: z.string(),
})
export type StoredSession = z.infer<typeof StoredSession>

export type Session = Omit<StoredSession, 'tokens'> & { sid: string; tokenCache: string }

function sessionKey(sid: string) {
  return SESSION_PREFIX + sid
}

/** Mints a fresh sid. Callers rotate on login by never reusing an old one. */
export async function createSession(input: {
  homeAccountId: string
  claims: SessionClaims
  tokenCache: string
}): Promise<string> {
  const { SESSION_IDLE_TTL_SECONDS, SESSION_ABSOLUTE_TTL_SECONDS } = env()
  const now = Date.now()
  const sid = opaqueId()
  const record: StoredSession = {
    createdAt: now,
    absoluteExpiresAt: now + SESSION_ABSOLUTE_TTL_SECONDS * 1000,
    homeAccountId: input.homeAccountId,
    claims: SessionClaims.parse(input.claims),
    tokens: encrypt(input.tokenCache),
  }
  await redis().set(sessionKey(sid), JSON.stringify(record), 'EX', SESSION_IDLE_TTL_SECONDS)
  return sid
}

/**
 * Loads a session, enforcing the absolute cap and sliding the idle window.
 * Returns null for unknown, expired or tampered sessions.
 */
export async function getSession(sid: string | undefined): Promise<Session | null> {
  if (!sid) return null
  const raw = await redis().get(sessionKey(sid))
  if (!raw) return null

  let record: StoredSession
  try {
    record = StoredSession.parse(JSON.parse(raw))
  } catch {
    await destroySession(sid)
    return null
  }

  if (Date.now() > record.absoluteExpiresAt) {
    await destroySession(sid)
    return null
  }

  let tokenCache: string
  try {
    tokenCache = decrypt(record.tokens)
  } catch {
    await destroySession(sid)
    return null
  }

  // Rolling idle window.
  await redis().expire(sessionKey(sid), env().SESSION_IDLE_TTL_SECONDS)

  const { tokens: _tokens, ...rest } = record
  return { ...rest, sid, tokenCache }
}

/** Persists a refreshed MSAL cache (and optionally updated claims) in place. */
export async function updateSession(
  session: Session,
  patch: { tokenCache?: string; claims?: SessionClaims },
): Promise<Session> {
  const next: Session = {
    ...session,
    tokenCache: patch.tokenCache ?? session.tokenCache,
    claims: patch.claims ?? session.claims,
  }
  const record: StoredSession = {
    createdAt: next.createdAt,
    absoluteExpiresAt: next.absoluteExpiresAt,
    homeAccountId: next.homeAccountId,
    claims: next.claims,
    tokens: encrypt(next.tokenCache),
  }
  const ttl = Math.min(
    env().SESSION_IDLE_TTL_SECONDS,
    Math.max(1, Math.floor((next.absoluteExpiresAt - Date.now()) / 1000)),
  )
  await redis().set(sessionKey(next.sid), JSON.stringify(record), 'EX', ttl)
  return next
}

export async function destroySession(sid: string | undefined): Promise<void> {
  if (!sid) return
  await redis().del(sessionKey(sid))
}

export function setSessionCookie(res: NextResponse, sid: string): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: sid,
    httpOnly: true,
    secure: !env().DEV_INSECURE_COOKIE,
    sameSite: 'lax',
    path: '/',
    maxAge: env().SESSION_ABSOLUTE_TTL_SECONDS,
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: !env().DEV_INSECURE_COOKIE,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

// ---------------------------------------------------------------------------
// Auth-code transaction state (PKCE verifier + nonce), short lived.
// ---------------------------------------------------------------------------

const AuthTx = z.object({
  codeVerifier: z.string(),
  nonce: z.string(),
  returnTo: z.string(),
})
export type AuthTx = z.infer<typeof AuthTx>

export async function saveAuthTx(state: string, tx: AuthTx): Promise<void> {
  await redis().set(AUTHTX_PREFIX + state, JSON.stringify(AuthTx.parse(tx)), 'EX', AUTHTX_TTL_SECONDS)
}

/** Single use: the record is deleted as it is read. */
export async function takeAuthTx(state: string): Promise<AuthTx | null> {
  const key = AUTHTX_PREFIX + state
  const raw = await redis().getdel(key)
  if (!raw) return null
  try {
    return AuthTx.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function setAuthTxCookie(res: NextResponse, state: string): void {
  res.cookies.set({
    name: AUTHTX_COOKIE,
    value: state,
    httpOnly: true,
    secure: !env().DEV_INSECURE_COOKIE,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTHTX_TTL_SECONDS,
  })
}

export function clearAuthTxCookie(res: NextResponse): void {
  res.cookies.set({
    name: AUTHTX_COOKIE,
    value: '',
    httpOnly: true,
    secure: !env().DEV_INSECURE_COOKIE,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
