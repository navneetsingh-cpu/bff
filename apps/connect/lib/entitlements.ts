import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import type { InternalAssertionClaims } from '@bff/internal-auth';

/**
 * What this app is allowed to do, for one user.
 *
 * Entitlements are deliberately not roles. Roles arrive inside the assertion
 * and describe the person org-wide; entitlements are resolved here and describe
 * what *this* app lets them do. Keeping them apart means the BFF never has to
 * know connect's permission vocabulary.
 */

/** Permission strings this app understands. Kept as a const so typos fail. */
export const PERMISSIONS = {
  /** See every person in the directory, not just yourself. */
  viewAll: 'connect.viewAll',
  /** Change your own profile. */
  editProfile: 'connect.editProfile',
} as const;

/**
 * The single shape both branches return. The api branch parses its HTTP
 * response through this same schema, so a remote service that drifts fails
 * here rather than halfway through rendering a page.
 */
export const EntitlementsSchema = z.object({
  userId: z.string().min(1),
  permissions: z.array(z.string()),
  source: z.enum(['mock', 'api']),
  resolvedAt: z.string(),
});

export type Entitlements = z.infer<typeof EntitlementsSchema>;

/**
 * Which backend resolves entitlements. 'mock' is the default so a fresh clone
 * boots with no extra services running.
 */
type Source = 'mock' | 'api';

function configuredSource(): Source {
  return process.env.ENTITLEMENTS_SOURCE === 'api' ? 'api' : 'mock';
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: Entitlements;
  expiresAt: number;
}

/**
 * Per-process, in-memory, keyed by userId.
 *
 * NOTE: this lives in one container. Two replicas keep two independent caches,
 * so a permission change can appear on one and not the other for up to the TTL.
 * The moment this app runs more than one replica, move this to Redis — the BFF
 * already has a connection and the same 60s TTL would apply there.
 */
const cache = new Map<string, CacheEntry>();

function readCache(userId: string): Entitlements | null {
  const hit = cache.get(userId);
  if (!hit) return null;

  if (Date.now() > hit.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return hit.value;
}

function writeCache(userId: string, value: Entitlements): void {
  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Drops a user's cached entitlements. Call after a change that grants or revokes. */
export function invalidateEntitlements(userId: string): void {
  cache.delete(userId);
}

// ---------------------------------------------------------------------------
// mock source
// ---------------------------------------------------------------------------

/**
 * Hardcoded entitlements, one entry per seeded stub user.
 *
 * The three tiers are deliberately different so switching users on the stub
 * login screen visibly changes what the page renders: full directory, self-only
 * with an edit button, self-only with nothing.
 *
 * Keys are the `userId` values from apps/bff/lib/auth/users.ts. The
 * alice/bob/carol aliases below are the same three tiers under friendlier
 * names, kept so a differently-seeded stub set still demos.
 */
const MOCK_ENTITLEMENTS: Record<string, string[]> = {
  // Ada Lovelace — sees everyone, can edit her profile.
  'u-1001': [PERMISSIONS.viewAll, PERMISSIONS.editProfile],
  // Grace Hopper — self-only, can edit her profile.
  'u-1002': [PERMISSIONS.editProfile],
  // Alan Turing — self-only, read-only. Note he holds the `connect.admin`
  // *role*; that deliberately grants no entitlement here, to show the two are
  // separate systems.
  'u-1003': [],

  alice: [PERMISSIONS.viewAll, PERMISSIONS.editProfile],
  bob: [PERMISSIONS.editProfile],
  carol: [],
};

function resolveMock(userId: string): Entitlements {
  return EntitlementsSchema.parse({
    userId,
    // Unknown user -> no permissions. Never fall back to a permissive default.
    permissions: MOCK_ENTITLEMENTS[userId] ?? [],
    source: 'mock',
    resolvedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// api source
// ---------------------------------------------------------------------------

const API_TIMEOUT_MS = 3_000;

let client: AxiosInstance | null = null;

function apiClient(): AxiosInstance {
  if (client) return client;

  const baseURL = process.env.ENTITLEMENTS_API_URL;
  if (!baseURL) {
    throw new Error('ENTITLEMENTS_SOURCE=api but ENTITLEMENTS_API_URL is not set.');
  }

  client = axios.create({
    baseURL,
    timeout: API_TIMEOUT_MS,
    headers: { accept: 'application/json' },
    // Resolve on any status so retry logic below decides, not a thrown error.
    validateStatus: () => true,
  });
  return client;
}

/**
 * Not wired to anything real yet — no such service exists in this stack. The
 * shape is here so switching ENTITLEMENTS_SOURCE later is a config change and
 * not a rewrite.
 *
 * One retry, only on 5xx. A 4xx is the service telling us the answer; retrying
 * it just doubles the latency before the same failure.
 */
async function resolveApi(claims: InternalAssertionClaims): Promise<Entitlements> {
  // TODO: replace with the real endpoint, and send the caller's identity with
  // it. Two things to decide when that service exists:
  //   1. path   — e.g. `/v1/users/${claims.sub}/entitlements`
  //   2. auth   — either forward the internal assertion, or attach a
  //               service-to-service credential:
  //               headers: { authorization: `Bearer ${await serviceToken()}` }
  // Do NOT pass the user's identity in a query parameter.
  const path = `/v1/users/${encodeURIComponent(claims.sub)}/entitlements`;

  const http = apiClient();
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await http.get(path);
    lastStatus = response.status;

    if (response.status < 500) {
      if (response.status >= 400) {
        throw new Error(`entitlements api responded ${response.status}`);
      }

      // Same schema as the mock branch. A drifted response fails here.
      return EntitlementsSchema.parse({
        userId: claims.sub,
        permissions: response.data?.permissions ?? [],
        source: 'api',
        resolvedAt: new Date().toISOString(),
      });
    }
  }

  throw new Error(`entitlements api responded ${lastStatus} after retry`);
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

/**
 * Resolves the caller's entitlements.
 *
 * Takes verified assertion claims, not a userId, so there is no way to call
 * this for an arbitrary user from request data — the only `sub` available is
 * one that already passed signature, audience and expiry checks.
 */
export async function getEntitlements(claims: InternalAssertionClaims): Promise<Entitlements> {
  // This module must never reach a browser bundle: the api branch would carry
  // ENTITLEMENTS_API_URL and, later, a service credential with it. Importing
  // this from a client component should fail loudly rather than ship.
  if (typeof window !== 'undefined') {
    throw new Error('getEntitlements is server-side only — it must never run in a browser.');
  }

  const userId = claims.sub;
  const source = configuredSource();

  const cached = readCache(userId);
  if (cached) {
    log(cached, 'cached');
    return cached;
  }

  const resolved = source === 'api' ? await resolveApi(claims) : resolveMock(userId);

  writeCache(userId, resolved);
  log(resolved, 'fresh');
  return resolved;
}

function log(result: Entitlements, freshness: 'cached' | 'fresh'): void {
  console.log(
    `entitlements: ${result.userId} -> ${result.permissions.length} permissions ` +
      `(${result.source}, ${freshness})`,
  );
}

/** Convenience for the permission checks scattered through the UI. */
export function can(entitlements: Entitlements, permission: string): boolean {
  return entitlements.permissions.includes(permission);
}
