import {
  INTERNAL_ASSERTION_HEADER,
  verifyInternalAssertion,
  type VerifyResult,
} from '@bff/internal-auth';

/**
 * This app's audience. An assertion the BFF minted for `iif` or `handbook` must
 * not verify here, which is what makes the audience claim worth having.
 */
export const AUDIENCE = 'connect';

/**
 * The minimum a caller has to provide. Widened from `Headers` so this works
 * with both the real thing in middleware and the `ReadonlyHeaders` that
 * `next/headers` hands a server component.
 */
interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The one and only way this app learns who the caller is.
 *
 * Not the session cookie, not X-User-Email, not a query parameter — a signed
 * assertion in a single header, verified on every request. Anything else on the
 * request is attacker-controlled as far as this app is concerned.
 */
export function verifyRequestIdentity(headers: HeaderReader): Promise<VerifyResult> {
  return verifyInternalAssertion(headers.get(INTERNAL_ASSERTION_HEADER), {
    secret: process.env.INTERNAL_JWT_SECRET ?? '',
    audience: AUDIENCE,
    issuer: process.env.INTERNAL_JWT_ISSUER || 'bff',
  });
}
