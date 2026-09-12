import type { NextRequest, NextResponse } from 'next/server';
import { isProduction, sessionCookieName } from './env';

/**
 * No Max-Age: this is a browser-session cookie. Lifetime is decided server-side
 * by the Redis TTL and the absolute cap, so a stolen cookie can't outlive them.
 *
 * In production the cookie name should be `__Host-sid`; browsers only accept
 * that prefix when Secure + Path=/ + no Domain, which is exactly the shape here.
 */
function baseOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: isProduction(),
  };
}

export function readSessionId(req: NextRequest): string | undefined {
  return req.cookies.get(sessionCookieName())?.value;
}

export function setSessionCookie(res: NextResponse, sid: string): void {
  res.cookies.set(sessionCookieName(), sid, baseOptions());
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(sessionCookieName(), '', { ...baseOptions(), maxAge: 0 });
}

/** Short-lived cookies holding the OIDC state/nonce/PKCE verifier between redirects. */
export function setTransientCookie(res: NextResponse, name: string, value: string, ttlSeconds = 600): void {
  res.cookies.set(name, value, { ...baseOptions(), maxAge: ttlSeconds });
}

export function clearTransientCookie(res: NextResponse, name: string): void {
  res.cookies.set(name, '', { ...baseOptions(), maxAge: 0 });
}
