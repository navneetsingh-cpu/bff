# Copilot instructions

You are working in a backend-for-frontend (BFF) monorepo. The whole point of the
architecture is that authentication tokens never reach the browser. Several of
the rules below exist to keep that true. Follow them even when a shorter path
looks obviously easier.

## Project shape

- npm workspaces monorepo. Next.js 14 (App Router), React 18, TypeScript, strict mode.
- `apps/bff` is the **only** app reachable from outside. It publishes port 3000.
- `apps/connect`, `apps/iif`, `apps/handbook` are internal. They publish no ports
  and are reachable only through the BFF proxy.
- `packages/internal-auth` is the shared identity library. It ships TypeScript
  source and is compiled in place via `transpilePackages`.
- `packages/session-sync` holds the sign-out button and the cross-tab logout
  machinery. Same arrangement: TypeScript source, transpiled in place.

## Package manager

- Use **npm only**. Never suggest, generate, or reference pnpm or yarn — no
  `pnpm-lock.yaml`, no `yarn.lock`, no `pnpm dlx`, no `yarn add`.
- There is exactly one lockfile: `package-lock.json` at the repo root. **Never
  edit it by hand** and never generate a diff against it. Let npm write it.
- Install into a workspace: `npm i -w <workspace> <package>`, e.g.
  `npm i -w @bff/bff zod`.
- Run a workspace script: `npm run <script> --workspace=<name>`, e.g.
  `npm run build --workspace=@bff/bff`.
- Docker builds use `npm ci`. Any dependency you add must be committed in the
  lockfile or the build fails.

## Security invariants — never violate these

These are not style preferences. Code that breaks one of them is a defect even
if it compiles, passes review, and does what the user asked.

**Tokens never reach browser-reachable code.**

- Never write an access token, refresh token, or ID token to `localStorage`,
  `sessionStorage`, IndexedDB, or a non-`HttpOnly` cookie.
- Never put a token in React state, props, context, a server-component return
  value, a client-component prop, a URL, a query parameter, or a hidden form field.
- Never send a token to the browser in a JSON response.
- Tokens live in `apps/bff` server code and nowhere else. If your change would
  make a token observable from a `'use client'` file, the change is wrong.

**The session cookie is opaque.**

- The `sid` cookie is 32 random bytes and carries no information. Never put
  claims, roles, email, expiry, or any other data in it.
- Everything about the user lives in Redis under `sess:<sid>`.
- Never add a second cookie that mirrors session data "for convenience".

**Sub-apps derive identity from one source only.**

- The only identity input a sub-app may read is the `X-Internal-Assertion`
  header, and only after `verifyInternalAssertion` returns `ok: true`.
- Never read identity from `X-User-Id`, `X-User-Email`, `X-Forwarded-User`, a
  cookie, a query parameter, or a request body. Those are all attacker-controlled.
- Never add a "trusted" header as a shortcut around verification.
- The proxy strips every inbound `X-Internal-*` and `X-User-*` header. Do not
  remove that strip, and do not add new identity headers for it to miss.

**CSP stays strict.**

- Never add `'unsafe-inline'` or `'unsafe-eval'` to `script-src`.
- Inline scripts must carry the per-request nonce that
  `apps/bff/middleware.ts` generates. If something needs an inline script, use
  the nonce; do not weaken the policy.
- Never remove `frame-ancestors 'none'`.

**CORS stays closed.**

- Everything is same-origin through the BFF on port 3000. Never add
  `Access-Control-Allow-Origin`, never add a CORS middleware, never add a
  wildcard origin.
- If something appears to need CORS, it should be proxied through the BFF instead.

**CSRF checks are not optional.**

- Every non-GET request passes the `Origin` / `Sec-Fetch-Site` same-origin check
  in `apps/bff/lib/csrf.ts`. Never add an exemption, and never change a mutating
  route to GET to avoid the check.
- `/api/auth/callback` is the one exemption, because the OIDC redirect
  legitimately arrives cross-origin. It is protected by `state` and PKCE instead.

**Sign-out.**

- Signing out means deleting the Redis session key. Clearing the cookie,
  `Clear-Site-Data`, and the cross-tab broadcast are all secondary — never
  implement a logout that skips the `DEL`.
- `Clear-Site-Data` belongs on `/api/auth/logout` and nowhere else. On any other
  route it destroys state the app needs.
- Logout is a POST. Never add a GET handler to it, and never trigger it with
  `window.location` — use `<LogoutButton />` or `useLogout()` from
  `@bff/session-sync`, which submit a form so the origin check passes.
- `/api/auth/logged-out` must stay public and must never read the session. It
  renders for users who have just had theirs destroyed.

**Logging.**

- Never log cookie values, session ids, tokens, assertions, `Authorization`
  headers, or a full request header dump.
- Log the route, method, status, and a decision ("rejected: bad audience"). If
  you need to correlate by session, log a hash, never the raw `sid`.

## Runtime rules

- Anything touching Redis, `openid-client`, or Node built-ins (`node:crypto`,
  `fs`) runs on the **Node runtime**. Put `export const runtime = 'nodejs'` on
  those route handlers. They will not run on the edge runtime.
- `apps/bff/middleware.ts` runs on the edge runtime. It does CSP, security
  headers, and the CSRF origin check — **nothing else**. Do not add session
  lookups, database calls, or role checks there.
- Real authorization belongs in route handlers and server components, where the
  session is available.
- Sub-app middleware is the one place a gate lives in middleware: it verifies the
  assertion signature. That is pure crypto with no I/O, so it runs on the edge
  fine. Pages re-verify rather than trusting a header the middleware set.
- Keep both middleware files runtime-agnostic: WebCrypto and `jose`, never
  `node:crypto` or `ioredis`.

## Conventions

- **Server components by default.** Add `'use client'` only when the component
  needs state, effects, or browser event handlers. If you add it, keep the
  client boundary as small as possible — push it to a leaf, don't mark a whole page.
- **Named exports** everywhere. The only default exports are Next.js's required
  ones: `page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx`, and
  `next.config.js`.
- **Validate all external input with zod** — request bodies, query parameters,
  form data, and anything read back out of Redis. Parse at the boundary, then
  work with the typed result. (`zod` is not installed yet; add it with
  `npm i -w <workspace> zod` the first time you need it.)
- TypeScript is strict with `noUncheckedIndexedAccess`. Do not add `any`, do not
  add `@ts-ignore`, and do not disable a rule to make an error go away.
- Comments explain *why*, not *what*. Match the density of the surrounding file.
- No new dependency for something the platform already does. `fetch`,
  `crypto.randomUUID`, and `URL` are all available.

## Where things live

| Put it here | When |
| --- | --- |
| `packages/internal-auth/src/` | Anything about minting or verifying the assertion, or shared identity types. Both the BFF and all three sub-apps import it. |
| `packages/session-sync/src/` | Anything about signing out from the client: the button, the hook, the BroadcastChannel listener. Import `@bff/session-sync/contract` (not the root) from middleware or any other Edge-runtime code — the root entry pulls in React. |
| `apps/bff/lib/auth/` | Login flows. `stub.ts` and `oidc.ts` both implement `AuthProvider` in `provider.ts`. Add a new mode by adding a third implementation, not by branching in a route. |
| `apps/bff/lib/session.ts` | Session create / read / rotate / destroy. All Redis session access goes through here. |
| `apps/bff/lib/proxy.ts` | The proxy. Header stripping and assertion minting happen here, once, for all three sub-apps. |
| `apps/bff/lib/env.ts` | Every environment variable read. Never call `process.env` directly in a route handler. |
| `apps/bff/app/api/` | BFF API routes. |
| `apps/bff/app/<app>/[[...path]]/route.ts` | The catch-all proxy route per sub-app. These are thin — logic belongs in `lib/proxy.ts`. |
| `apps/<subapp>/lib/identity.ts` | The sub-app's audience constant and its verify helper. |
| `apps/<subapp>/app/` | The sub-app's pages. |
| `docs/` | Architecture explainers. |

Proxying deliberately uses catch-all route handlers, **not** `next.config.js`
rewrites — a declarative rewrite cannot look up the session and mint a
per-request assertion. Do not "simplify" it into a rewrite.

## If you are unsure

- **Anything identity-related:** read `packages/internal-auth/src/assertion.ts`
  first. If your change would let a sub-app trust something that library did not
  verify, stop and say so instead of writing it.
- **Adding a route that reads user data:** it belongs in `apps/bff` unless the
  sub-app can get everything it needs from the verified assertion claims.
- **Tempted to pass identity between services some other way:** don't. Add a
  claim to the assertion instead.
- **A rule here conflicts with what you were asked to do:** say so explicitly in
  your response. Do not silently pick either one.
