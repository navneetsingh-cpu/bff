import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import {
  DEFAULT_ASSERTION_TTL_SECONDS,
  DEFAULT_CLOCK_TOLERANCE_SECONDS,
  DEFAULT_INTERNAL_ISSUER,
} from './constants';
import type { InternalAssertionClaims, VerifiedIdentity } from './types';

/**
 * HS256 today because a single shared secret is the least moving parts for local
 * dev. The mint/verify pair is the only place that knows the algorithm, so
 * swapping to RS256/ES256 with a JWKS is a change to these two functions.
 */
const ALG = 'HS256';

function keyFrom(secret: string): Uint8Array {
  if (!secret) {
    throw new Error('INTERNAL_JWT_SECRET is empty — refusing to sign or verify.');
  }
  return new TextEncoder().encode(secret);
}

export interface MintOptions {
  secret: string;
  /** The sub-app this assertion is for: 'connect' | 'iif' | 'handbook'. */
  audience: string;
  subject: string;
  email: string;
  name?: string;
  roles?: string[];
  issuer?: string;
  ttlSeconds?: number;
}

/**
 * Mints a single-use, short-lived assertion. One per proxied request — never
 * cache these, the whole point is that a leaked token is useless in a minute.
 */
export async function mintInternalAssertion(options: MintOptions): Promise<string> {
  const {
    secret,
    audience,
    subject,
    email,
    name = '',
    roles = [],
    issuer = DEFAULT_INTERNAL_ISSUER,
    ttlSeconds = DEFAULT_ASSERTION_TTL_SECONDS,
  } = options;

  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ email, name, roles })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setJti(crypto.randomUUID())
    .sign(keyFrom(secret));
}

export interface VerifyOptions {
  secret: string;
  /** The sub-app doing the verifying. A token minted for another app must fail. */
  audience: string;
  issuer?: string;
  clockToleranceSeconds?: number;
}

export type VerifyResult =
  | { ok: true; claims: InternalAssertionClaims; identity: VerifiedIdentity }
  | { ok: false; reason: string };

/**
 * Verifies signature, issuer, audience and expiry. Returns a result object
 * rather than throwing so callers can turn any failure into a flat 401 without
 * leaking which check failed to the caller.
 */
export async function verifyInternalAssertion(
  token: string | null | undefined,
  options: VerifyOptions,
): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: 'missing assertion' };

  const {
    secret,
    audience,
    issuer = DEFAULT_INTERNAL_ISSUER,
    clockToleranceSeconds = DEFAULT_CLOCK_TOLERANCE_SECONDS,
  } = options;

  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: [ALG],
      issuer,
      audience,
      clockTolerance: clockToleranceSeconds,
    });

    const identity = identityFrom(payload);
    if (!identity) return { ok: false, reason: 'assertion missing required claims' };

    return {
      ok: true,
      identity,
      claims: {
        ...identity,
        iss: String(payload.iss),
        aud: String(payload.aud),
        iat: Number(payload.iat),
        exp: Number(payload.exp),
        jti: String(payload.jti ?? ''),
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid assertion' };
  }
}

function identityFrom(payload: JWTPayload): VerifiedIdentity | null {
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== 'string' || !sub) return null;
  if (typeof email !== 'string' || !email) return null;

  const rawRoles = payload.roles;
  const roles = Array.isArray(rawRoles) ? rawRoles.filter((r): r is string => typeof r === 'string') : [];

  return {
    sub,
    email,
    name: typeof payload.name === 'string' ? payload.name : '',
    roles,
  };
}
