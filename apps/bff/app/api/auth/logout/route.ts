import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookie, readSessionId } from '@/lib/cookies';
import { destroySession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST only. Logout changes state, so it goes through the same origin check as
 * every other mutation — a cross-site <img src="/api/auth/logout"> shouldn't be
 * able to sign someone out.
 */
export async function POST(req: NextRequest) {
  await destroySession(readSessionId(req));

  const res = NextResponse.redirect(new URL('/', req.nextUrl.origin), { status: 303 });
  clearSessionCookie(res);
  return res;
}
