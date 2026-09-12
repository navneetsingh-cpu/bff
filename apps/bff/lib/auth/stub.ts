import { NextResponse, type NextRequest } from 'next/server';
import { LOGGED_OUT_PATH } from '@bff/session-sync/contract';
import { readSessionId, setSessionCookie } from '../cookies';
import { safeReturnTo } from '../redirects';
import { rotateSessionOnLogin } from '../session';
import { STUB_USERS, findStubUser } from './users';
import type { AuthProvider } from './provider';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Plain server-rendered HTML, no client JS. That keeps it compatible with the
 * strict-dynamic CSP without needing a nonce, and makes it obvious that the
 * only thing crossing the wire is a form POST.
 */
function loginPage(returnTo: string): string {
  const options = STUB_USERS.map(
    (user) => `
      <button type="submit" name="userId" value="${escapeHtml(user.userId)}" class="user">
        <span class="name">${escapeHtml(user.name)}</span>
        <span class="email">${escapeHtml(user.email)}</span>
        <span class="roles">${escapeHtml(user.roles.join(' · '))}</span>
      </button>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in — BFF (stub mode)</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      background: Canvas; color: CanvasText;
    }
    main { width: min(28rem, calc(100vw - 3rem)); }
    h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
    p.hint { margin: 0 0 1.5rem; opacity: .7; font-size: .875rem; }
    form { display: grid; gap: .625rem; }
    .user {
      display: grid; gap: .125rem; text-align: left; cursor: pointer;
      padding: .875rem 1rem; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
      border-radius: .5rem; background: transparent; color: inherit; font: inherit;
    }
    .user:hover { border-color: color-mix(in srgb, CanvasText 45%, transparent); }
    .name { font-weight: 600; }
    .email { font-size: .8125rem; opacity: .75; }
    .roles { font-size: .75rem; opacity: .6; font-family: ui-monospace, SFMono-Regular, monospace; }
    .mode { margin-top: 1.5rem; font-size: .75rem; opacity: .55; }
  </style>
</head>
<body>
  <main>
    <h1>Sign in</h1>
    <p class="hint">Stub auth is on. Pick a seeded user — no password, no identity provider.</p>
    <form method="post" action="/api/auth/login">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
      ${options}
    </form>
    <p class="mode">AUTH_MODE=stub · set it to <code>oidc</code> to use Entra instead.</p>
  </main>
</body>
</html>`;
}

export const stubProvider: AuthProvider = {
  mode: 'stub',

  async startLogin(req: NextRequest): Promise<Response> {
    const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo'));
    return new NextResponse(loginPage(returnTo), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  },

  async submitLogin(req: NextRequest): Promise<Response> {
    const form = await req.formData();
    const user = findStubUser(form.get('userId')?.toString());

    if (!user) {
      return NextResponse.json({ error: 'unknown_user' }, { status: 400 });
    }

    const returnTo = safeReturnTo(form.get('returnTo')?.toString());
    const sid = await rotateSessionOnLogin(readSessionId(req), user);

    const res = NextResponse.redirect(new URL(returnTo, req.nextUrl.origin), { status: 303 });
    setSessionCookie(res, sid);
    return res;
  },

  async handleCallback(): Promise<Response> {
    return NextResponse.json(
      { error: 'not_applicable', detail: 'AUTH_MODE=stub has no OIDC callback.' },
      { status: 404 },
    );
  },

  async buildLogoutRedirect(req: NextRequest): Promise<string> {
    // No identity provider in the picture, so destroying the local session is
    // the whole of sign-out.
    return new URL(LOGGED_OUT_PATH, req.nextUrl.origin).toString();
  },
};
