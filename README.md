# BFF starter

A Next.js 14 backend-for-frontend and three sub-apps, in Docker, on npm workspaces.

The BFF is the only thing with a published port. It owns the session, and it is
the only component that can turn a browser cookie into an identity. The sub-apps
never see a cookie; they learn who the caller is from a signed, 60-second
assertion header and nothing else.

```
browser ──:3000──▶ bff ─┬─▶ connect   (/connect)
                        ├─▶ iif       (/iif)
                        ├─▶ handbook  (/handbook)
                        └─▶ redis     (sessions)
```

## Layout

| Path | What it is |
| --- | --- |
| [apps/bff/](apps/bff/) | Session, auth, proxy, security headers. Port 3000. |
| [apps/connect/](apps/connect/) | People and org directory. `basePath: '/connect'`. |
| [apps/iif/](apps/iif/) | Intake form workflow. `basePath: '/iif'`. |
| [apps/handbook/](apps/handbook/) | Policy documents. `basePath: '/handbook'`. |
| [packages/internal-auth/](packages/internal-auth/) | Mint/verify the internal assertion, shared types. |

## Running it

Requires Docker Desktop (or Docker Engine + Compose v2) and Node 20 if you want
to run scripts outside the containers.

```bash
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
docker compose up --build
```

Then open <http://localhost:3000>.

You'll land signed out. **Sign in** goes to `/api/auth/login`, which in stub mode
renders a picker with three seeded users — Ada, Grace and Alan, each with a
different set of roles. Pick one, then follow a sub-app link. The sub-app page
shows the claims it verified out of the assertion: if the name and roles there
match who you signed in as, the whole handoff is working.

Useful checks:

```bash
curl http://localhost:3000/api/health          # liveness, touches nothing
curl http://localhost:3000/api/auth/me         # identity, or authenticated:false
docker compose logs -f bff
```

### Everyday commands

```bash
npm ci                                        # install from the root lockfile
npm run build --workspace=@bff/bff            # per-app scripts go through --workspace
npm run typecheck --workspaces --if-present
docker compose down -v                        # also drops redis + .next volumes
```

This repo is npm-only. One lockfile at the root, `npm ci` in every Docker build,
and every per-app script invoked as `npm run <script> --workspace=<name>`.

### Hot reload

Compose builds the `dev` target and bind-mounts `apps/*` and
`packages/internal-auth` over the image, so edits are picked up without a
rebuild — including edits to the shared package, which both sides compile via
`transpilePackages`. `.next` stays in a named volume rather than on the host.

`WATCHPACK_POLLING=true` is on by default because bind mounts on Windows and
macOS don't deliver filesystem events reliably. On Linux you can set it to
`false` in `.env` for lower idle CPU.

Rebuild the image only when a `package.json` changes:

```bash
docker compose up --build
```

## How identity moves

1. **Login** creates a session in Redis and sets an opaque cookie. The sid is 32
   bytes of CSPRNG output, base64url encoded. It carries no information — every
   claim about the user lives server-side under `sess:<sid>`.
2. **Every proxied request** goes through a catch-all Route Handler on the Node
   runtime ([apps/bff/lib/proxy.ts](apps/bff/lib/proxy.ts)). It:
   - resolves the session, and 401s or redirects to login if there isn't one;
   - **deletes every inbound `X-Internal-*` and `X-User-*` header**, so nothing a
     client sent can survive into the upstream request;
   - drops the `Cookie` header entirely — sub-apps have no business seeing it;
   - mints a fresh HS256 JWT with `aud` set to that one sub-app, 60-second
     expiry, claims `sub`, `email`, `name`, `roles`, and attaches it as
     `X-Internal-Assertion`.
3. **The sub-app** verifies signature, `iss`, `aud` and `exp` in its middleware
   and 401s on any failure. An assertion minted for `connect` will not verify in
   `iif` — that's what the audience claim is for.

### Session lifetime

Two independent clocks, both enforced server-side:

- **Idle, 30 minutes.** The Redis TTL, rolled forward on every request.
- **Absolute, 8 hours.** Checked against `createdAt` on read; past it, the record
  is deleted regardless of activity.

The cookie itself has no `Max-Age`, so it dies with the browser session and can
never outlive the server-side record.

**The sid rotates on login.** `rotateSessionOnLogin` destroys any pre-existing
session before creating the new one, so a session id planted before login is
worthless after it.

### CSRF

No tokens, no hidden fields. Every non-GET request must prove same-origin:
`Sec-Fetch-Site: same-origin`, or an `Origin` whose host matches the request
host. Anything else is a 403 in middleware. `/api/auth/callback` is exempt
because the OIDC redirect legitimately arrives cross-origin — it's protected by
`state` and the PKCE verifier instead.

### CSP

[apps/bff/middleware.ts](apps/bff/middleware.ts) generates a per-request nonce
and sets `script-src 'self' 'nonce-…' 'strict-dynamic'`, plus
`frame-ancestors 'none'`, `nosniff` and `Referrer-Policy`. The CSP is set on the
*request* headers as well as the response, which is how Next finds the nonce to
stamp onto its own script tags.

Proxied paths are skipped: the BFF's nonce would not match the sub-app's scripts.
Each sub-app sets its own headers.

## Switching to OIDC

Set up an app registration in Entra, then in `.env`:

```ini
AUTH_MODE=oidc
AZURE_TENANT_ID=<directory (tenant) id>
AZURE_CLIENT_ID=<application (client) id>
AZURE_CLIENT_SECRET=<a client secret value>
REDIRECT_URI=http://localhost:3000/api/auth/callback
```

`REDIRECT_URI` has to match a **Web** redirect URI on the registration exactly.
Restart with `docker compose up -d bff`.

`/api/auth/login` now redirects to Entra instead of rendering the picker.
[apps/bff/lib/auth/oidc.ts](apps/bff/lib/auth/oidc.ts) runs Authorization Code +
PKCE: `state`, `nonce` and the code verifier are held in httpOnly cookies for ten
minutes, and `openid-client` validates `state`, `nonce`, `iss`, `aud`, `exp` and
the verifier on the callback. `sub`/`oid` becomes the user id; Entra app roles
from the `roles` claim become the session roles.

Nothing downstream of the session cares which mode produced it — both providers
implement the same [`AuthProvider`](apps/bff/lib/auth/provider.ts) interface, and
the route handlers never branch on `AUTH_MODE`.

## Before production

This is a local-dev scaffold. Four things must change.

**1. Cookie name → `__Host-sid`.** Set `SESSION_COOKIE_NAME=__Host-sid`. The
prefix is only honoured when the cookie is `Secure`, `Path=/` and has no
`Domain`, which is already the shape the code sets — but `Secure` only turns on
when `NODE_ENV=production`, and the cookie won't be stored at all over plain
HTTP. So this and TLS land together.

**2. Certificate credential instead of a client secret.** Register a certificate
on the app registration and switch
[apps/bff/lib/auth/oidc.ts](apps/bff/lib/auth/oidc.ts) from
`client_secret_post` to `private_key_jwt`, with the private key from Key Vault
rather than an environment variable. Client secrets expire and end up in shell
history; certificates don't.

**3. Asymmetric internal JWT.** Today the BFF and all three sub-apps share one
HS256 secret — which means any sub-app holds everything it needs to *mint* an
assertion for any other. Move to RS256 or ES256: the BFF signs with a private
key, sub-apps verify against a published JWKS and can no longer forge anything.
The change is contained to
[packages/internal-auth/src/assertion.ts](packages/internal-auth/src/assertion.ts) —
swap `ALG`, take a `KeyLike` in `mint`, and fetch the JWKS with
`jose`'s `createRemoteJWKSet` in `verify`.

**4. Redis.** The dev container persists nothing and requires no auth. Use a
managed instance with TLS and credentials, and decide what should happen to live
sessions on failover.

Also worth doing before you ship: send `X-Forwarded-*` from a real reverse proxy
and configure Next to trust it, add structured request logging with the session
id hashed rather than raw, and put a rate limit in front of `/api/auth/login`.

## Two deliberate deviations

**Proxying happens in Route Handlers, not `next.config.js` rewrites.** The
declarative form —

```js
{ source: '/connect/:path*', destination: 'http://connect:3000/connect/:path*' }
```

— can't do the one thing this proxy exists for: look the session up in Redis and
attach a per-request assertion. Middleware can add headers ahead of a rewrite,
but Next 14 runs middleware on the Edge runtime, where `ioredis` can't run. So
the same three routes are served by catch-all handlers on the Node runtime
instead ([apps/bff/app/connect/\[\[...path\]\]/route.ts](apps/bff/app/connect/%5B%5B...path%5D%5D/route.ts)
and its two siblings). Identical URL contract, identical upstreams, one layer
that can actually authenticate.

**Middleware runs on Edge, not Node.** `runtime: 'nodejs'` for middleware only
became configurable in Next 15 (`experimental.nodeMiddleware`). Nothing in
either middleware needs Node APIs — the nonce comes from WebCrypto, CSRF is pure
header logic, and `jose` runs on both runtimes — so both files will work
unchanged if you move to Next 15 and turn Node middleware on.
