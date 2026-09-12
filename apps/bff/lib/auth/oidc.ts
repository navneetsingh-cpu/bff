import { NextResponse, type NextRequest } from 'next/server';
import { Issuer, generators, type Client, type IdTokenClaims } from 'openid-client';
import { azure } from '../env';
import {
  clearTransientCookie,
  readSessionId,
  setSessionCookie,
  setTransientCookie,
} from '../cookies';
import { safeReturnTo } from '../redirects';
import { rotateSessionOnLogin, type NewSessionInput } from '../session';
import type { AuthProvider } from './provider';

const COOKIE_STATE = 'oidc_state';
const COOKIE_NONCE = 'oidc_nonce';
const COOKIE_VERIFIER = 'oidc_verifier';
const COOKIE_RETURN_TO = 'oidc_return_to';
const TRANSIENT_TTL_SECONDS = 600;

const TRANSIENT_COOKIES = [COOKIE_STATE, COOKIE_NONCE, COOKIE_VERIFIER, COOKIE_RETURN_TO];

/**
 * Discovery is a network call; cache the resulting client for the life of the
 * process. Entra's metadata does not change between requests.
 */
let clientPromise: Promise<Client> | null = null;

function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { tenantId, clientId, clientSecret, redirectUri } = azure();
      const issuer = await Issuer.discover(`https://login.microsoftonline.com/${tenantId}/v2.0`);
      return new issuer.Client({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        response_types: ['code'],
        // Swap for 'private_key_jwt' when moving to a certificate credential.
        token_endpoint_auth_method: 'client_secret_post',
      });
    })().catch((error) => {
      // Don't cache a failed discovery — the next request should retry.
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

/**
 * Entra puts app roles in `roles`. Groups arrive in `groups` as object ids and
 * are deliberately not mapped here — map them to names in your own directory
 * lookup if you need them.
 */
function rolesFrom(claims: IdTokenClaims): string[] {
  const raw = (claims as Record<string, unknown>).roles;
  if (!Array.isArray(raw)) return [];
  return raw.filter((role): role is string => typeof role === 'string');
}

function sessionFrom(claims: IdTokenClaims): NewSessionInput | null {
  const email =
    claims.email ??
    (typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined) ??
    (typeof (claims as Record<string, unknown>).upn === 'string'
      ? ((claims as Record<string, unknown>).upn as string)
      : undefined);

  if (!claims.sub || !email) return null;

  return {
    userId: claims.oid ? String(claims.oid) : claims.sub,
    email,
    name: typeof claims.name === 'string' ? claims.name : email,
    roles: rolesFrom(claims),
  };
}

export const oidcProvider: AuthProvider = {
  mode: 'oidc',

  async startLogin(req: NextRequest): Promise<Response> {
    const client = await getClient();
    const { scope } = azure();

    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    const authorizationUrl = client.authorizationUrl({
      scope,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
    });

    const res = NextResponse.redirect(authorizationUrl, { status: 302 });
    // These must survive the round trip to Entra but nothing longer, and must
    // never be readable by script — hence httpOnly transient cookies.
    setTransientCookie(res, COOKIE_STATE, state, TRANSIENT_TTL_SECONDS);
    setTransientCookie(res, COOKIE_NONCE, nonce, TRANSIENT_TTL_SECONDS);
    setTransientCookie(res, COOKIE_VERIFIER, codeVerifier, TRANSIENT_TTL_SECONDS);
    setTransientCookie(
      res,
      COOKIE_RETURN_TO,
      safeReturnTo(req.nextUrl.searchParams.get('returnTo')),
      TRANSIENT_TTL_SECONDS,
    );
    return res;
  },

  async submitLogin(): Promise<Response> {
    return NextResponse.json(
      { error: 'method_not_allowed', detail: 'AUTH_MODE=oidc signs in via redirect, not POST.' },
      { status: 405 },
    );
  },

  async handleCallback(req: NextRequest): Promise<Response> {
    const client = await getClient();
    const { redirectUri, clientId } = azure();

    const state = req.cookies.get(COOKIE_STATE)?.value;
    const nonce = req.cookies.get(COOKIE_NONCE)?.value;
    const codeVerifier = req.cookies.get(COOKIE_VERIFIER)?.value;
    const returnTo = safeReturnTo(req.cookies.get(COOKIE_RETURN_TO)?.value);

    const fail = (detail: string, status = 400) => {
      const res = NextResponse.json({ error: 'login_failed', detail }, { status });
      for (const name of TRANSIENT_COOKIES) clearTransientCookie(res, name);
      return res;
    };

    if (!state || !nonce || !codeVerifier) {
      return fail('Login state expired or missing. Start over at /api/auth/login.');
    }

    try {
      const params = client.callbackParams(req.nextUrl.toString());

      // openid-client enforces state, nonce, iss, aud, exp, iat and the PKCE
      // verifier here. A mismatch on any of them throws.
      const tokenSet = await client.callback(redirectUri, params, {
        state,
        nonce,
        code_verifier: codeVerifier,
      });

      const claims = tokenSet.claims();

      // Belt and braces on top of the library's own checks.
      if (claims.aud !== clientId && !(Array.isArray(claims.aud) && claims.aud.includes(clientId))) {
        return fail('ID token audience mismatch.', 401);
      }

      const user = sessionFrom(claims);
      if (!user) return fail('ID token is missing sub or an email claim.', 401);

      const sid = await rotateSessionOnLogin(readSessionId(req), user);

      const res = NextResponse.redirect(new URL(returnTo, req.nextUrl.origin), { status: 303 });
      setSessionCookie(res, sid);
      for (const name of TRANSIENT_COOKIES) clearTransientCookie(res, name);
      return res;
    } catch (error) {
      console.error('[oidc] callback failed:', error instanceof Error ? error.message : error);
      return fail('Could not complete sign-in.', 401);
    }
  },
};
