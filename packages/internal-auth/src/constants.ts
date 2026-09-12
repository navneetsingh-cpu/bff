/** Header the BFF uses to carry the internal assertion to a sub-app. */
export const INTERNAL_ASSERTION_HEADER = 'x-internal-assertion';

/** Default `iss` claim. Override with INTERNAL_JWT_ISSUER. */
export const DEFAULT_INTERNAL_ISSUER = 'bff';

/** Assertions are minted per-request and live just long enough to cross the network. */
export const DEFAULT_ASSERTION_TTL_SECONDS = 60;

/** Small allowance for clock drift between containers. */
export const DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;

/**
 * Inbound header prefixes a client must never be able to set. The proxy deletes
 * every header matching these before it adds its own, so a caller cannot forge
 * an identity by simply sending `X-User-Email: admin@example.com`.
 */
export const UNTRUSTED_HEADER_PREFIXES = ['x-internal-', 'x-user-'] as const;

/** True if `name` is a header the proxy must strip from inbound requests. */
export function isUntrustedHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return UNTRUSTED_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Returns a copy of `headers` with every spoofable identity header removed.
 * Always call this before minting and attaching a fresh assertion.
 */
export function stripUntrustedHeaders(headers: Headers): Headers {
  const cleaned = new Headers(headers);
  for (const name of [...cleaned.keys()]) {
    if (isUntrustedHeader(name)) cleaned.delete(name);
  }
  return cleaned;
}
