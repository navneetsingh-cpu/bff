import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookie, readSessionId } from '@/lib/cookies';
import { destroySession } from '@/lib/session';
import { getAuthProvider } from '@/lib/auth/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tells the browser to drop everything it holds for this origin: the HTTP
 * cache, every cookie, and localStorage / sessionStorage / IndexedDB.
 *
 * This header is sent on **this route only**. It is a blunt instrument — on any
 * other route it would wipe state the app legitimately depends on, and on a
 * route that returns a subresource it can clear more than the author intended.
 *
 * Note that browsers only honour it in a secure context. That includes
 * http://localhost, so it works in dev, but it is silently ignored if the app
 * is ever served over plain HTTP from a real host.
 */
const CLEAR_SITE_DATA = '"cache", "cookies", "storage"';

/**
 * POST only. Signing out mutates state, so it goes through the same-origin
 * check in middleware like every other mutation — a cross-site
 * `<img src="/api/auth/logout">` must not be able to sign someone out.
 *
 * Order matters here. The server-side session is destroyed first, so that even
 * if the browser ignores every header below, the session id is already dead.
 */
export async function POST(req: NextRequest) {
  const sid = readSessionId(req);

  // DEL sess:<sid>. From this point the session id is meaningless: any request
  // that still carries the cookie will fail to resolve and be treated as signed
  // out, including requests already in flight from other tabs.
  await destroySession(sid);

  const provider = await getAuthProvider();
  const destination = await provider.buildLogoutRedirect(req);

  const res = NextResponse.redirect(destination, { status: 303 });

  // Belt and braces with Clear-Site-Data below. This sets Max-Age=0 with the
  // same name, Path, SameSite and Secure attributes the cookie was written
  // with — a mismatch on any of those and the browser keeps the original.
  clearSessionCookie(res);

  res.headers.set('clear-site-data', CLEAR_SITE_DATA);
  res.headers.set('cache-control', 'no-store');

  return res;
}
