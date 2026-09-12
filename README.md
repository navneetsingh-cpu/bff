# BFF monorepo

Next.js 14 (App Router, React 18, TypeScript) backend-for-frontend with two
internal apps behind it. Only the BFF is reachable from outside the compose
network; the sub-apps and Redis sit on an `internal: true` network.

```
apps/bff                 public edge: Entra auth, session, proxy
apps/app-hr              internal, basePath /hr
apps/app-ops             internal, basePath /ops
packages/internal-auth   EdDSA assertion mint/verify + shared types
```

## Getting started

```bash
pnpm install                 # generates pnpm-lock.yaml (required by the Dockerfiles)
pnpm keys                    # prints INTERNAL_JWT_* and SESSION_ENC_KEY
cp .env.example .env         # then fill in the Entra + key values
docker compose up --build
```

The BFF is published on `:8080`. Put TLS termination in front of it — `__Host-`
prefixed cookies are rejected by browsers over plain HTTP. For local HTTP-only
work set `DEV_INSECURE_COOKIE=true`, which falls back to a `sid` cookie without
the `Secure` attribute. Never set it anywhere else.

## Request flow

1. Browser hits `https://bff/hr/...`.
2. BFF middleware applies the CSP nonce, security headers and the CSRF check.
3. The optional catch-all route at `src/app/hr/[[...path]]/route.ts` loads the
   session from Redis by opaque sid, rebuilds the outbound headers, and mints a
   60s EdDSA assertion bound to `aud: app-hr`.
4. `app-hr` middleware verifies signature, issuer, audience and expiry. No other
   header is trusted for identity.
5. A downstream `401` triggers one server-side `acquireTokenSilent` refresh and a
   single retry.

`next.config.js` also declares plain rewrites for `/hr/:path*` and `/ops/:path*`.
Those are `afterFiles` rewrites, so the catch-all route handlers match first and
are what actually carry the assertion; the rewrites are the fallback if the proxy
routes are removed.

## Session model

- `__Host-sid` cookie: HttpOnly, Secure, SameSite=Lax, Path=/, holding a 32-byte
  base64url opaque id and nothing else. Rotated on every successful login — the
  pre-login session is deleted, never reused.
- Redis key `sess:<sid>` holds the MSAL token cache encrypted with AES-256-GCM
  (`SESSION_ENC_KEY`, a placeholder for a Key Vault backed key) plus the minimal
  claim set.
- Rolling 30 minute idle window (`EXPIRE` refreshed on read), hard 8 hour cap
  enforced in the record itself.
- PKCE verifier, nonce and `returnTo` live in a single-use `authtx:<state>` key
  with a 10 minute TTL, bound to the browser by a `__Host-authtx` cookie.

## Hardening notes

- CSRF: any non-GET/HEAD/OPTIONS request needs `Sec-Fetch-Site: same-origin` or a
  matching `Origin`. Requests with neither are rejected.
- The proxy drops inbound `X-Internal-*`, `X-User-*`, `Cookie` and `Authorization`
  headers before forwarding, so downstream apps cannot be fed a forged identity
  and the session cookie never leaves the BFF.
- Sliding-window Redis rate limit on `/api/auth/*`.
- `returnTo` is allowlisted to relative paths: no scheme, no authority, no `//`,
  no backslashes.
- Containers run as `node`, with `read_only` rootfs, a tmpfs `/tmp`, and
  `no-new-privileges`.

Two runtime dependencies worth knowing about: the sub-app middleware runs in the
Edge runtime and verifies Ed25519 via WebCrypto (Node 20 supports it), and it
reads `INTERNAL_JWT_PUBLIC_KEY` from `process.env` at request time, which works
for self-hosted `next start`/standalone but not on build-time-inlined platforms.

## Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/login` | GET | Starts auth code + PKCE, stores tx, redirects to Entra |
| `/api/auth/callback` | GET | Validates state/nonce, exchanges code, rotates sid |
| `/api/auth/logout` | POST | Clears the session, returns the Entra end-session URL |
| `/api/auth/logout` | GET | Front-channel logout endpoint for Entra |
| `/api/auth/me` | GET | Current claims plus an SSO handoff link |
| `/hr/*`, `/ops/*` | any | Authenticated proxy to the internal apps |

## MSAL SPA side

A separately hosted SPA (`SPA_BASE_URL`) authenticates against the same app
registration with `@azure/msal-browser`. The BFF hands off with
`buildSsoLink(spaBaseUrl)`, which appends `login_hint` taken from the session's
`idTokenClaims` and a validated relative `returnTo`:

```
https://spa.example.com/?login_hint=user@contoso.com&returnTo=%2Fdashboard
```

### Sign-in ladder

Escalate only as far as needed — silent first, then a non-interactive redirect,
then a real prompt:

```ts
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser'

const pca = new PublicClientApplication({
  auth: {
    clientId: AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    redirectUri: window.location.origin + '/auth/callback',
    postLogoutRedirectUri: window.location.origin + '/',
    navigateToLoginRequestUrl: false,
  },
  cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
})

await pca.initialize()
await pca.handleRedirectPromise()

const loginHint = new URLSearchParams(location.search).get('login_hint') ?? undefined
const request = { scopes: ['openid', 'profile', 'User.Read'], loginHint }

async function signIn() {
  // 1. Hidden iframe against the IdP session cookie. No UI, no navigation.
  try {
    return await pca.ssoSilent(request)
  } catch (e) {
    if (!(e instanceof InteractionRequiredAuthError)) throw e
  }

  // 2. Full redirect that still refuses to prompt. Covers the third-party-cookie
  //    and iframe-blocked cases where ssoSilent cannot work but an IdP session
  //    does exist. Returns via handleRedirectPromise on the next load.
  try {
    return await pca.loginRedirect({ ...request, prompt: 'none' })
  } catch (e) {
    if (!(e instanceof InteractionRequiredAuthError)) throw e
  }

  // 3. Interactive.
  return pca.loginRedirect(request)
}
```

`prompt: 'none'` comes back as `interaction_required`, `login_required` or
`consent_required` when there is no usable IdP session — those are the only
errors that should fall through to step 3. Anything else is a real failure and
should surface rather than loop.

### Front-channel logout wiring

Register both apps' logout endpoints on the app registration
(`Authentication → Front-channel logout URL`):

- BFF: `https://bff.example.com/api/auth/logout` — the `GET` handler destroys the
  Redis session and clears the cookie. Entra loads it in a hidden iframe; our
  `frame-ancestors 'none'` stops it rendering, but the request still arrives and
  the session is gone, which is the whole point.
- SPA: `https://spa.example.com/auth/logout` — clear the MSAL cache there.

SPA-initiated sign-out:

```ts
await fetch(BFF_ORIGIN + '/api/auth/logout', { method: 'POST', credentials: 'include' })
await pca.logoutRedirect({ account: pca.getActiveAccount() ?? undefined })
```

The BFF's own button does the same thing in one hop: `POST /api/auth/logout`
returns `{ logoutUrl }` and the page navigates there, so the Entra session ends
and every registered front-channel endpoint is notified.
