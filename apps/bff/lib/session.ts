import { randomBytes } from 'node:crypto';
import type { SessionRecord } from '@bff/internal-auth';
import { getRedis } from './redis';
import { sessionAbsoluteSeconds, sessionIdleSeconds } from './env';

const KEY_PREFIX = 'sess:';

/** 32 bytes of CSPRNG output, base64url encoded — 43 opaque characters. */
export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

const keyFor = (sid: string) => `${KEY_PREFIX}${sid}`;

export interface NewSessionInput {
  userId: string;
  email: string;
  name: string;
  roles: string[];
}

/**
 * Writes a fresh session and returns its id. The Redis TTL is the idle window;
 * the absolute cap is enforced on read against `createdAt`.
 */
export async function createSession(user: NewSessionInput): Promise<string> {
  const sid = newSessionId();
  const now = Date.now();

  const record: SessionRecord = {
    userId: user.userId,
    email: user.email,
    name: user.name,
    roles: user.roles,
    createdAt: now,
    lastSeenAt: now,
  };

  await getRedis().set(keyFor(sid), JSON.stringify(record), 'EX', sessionIdleSeconds());
  return sid;
}

/**
 * Loads a session and slides its idle window forward. Returns null — and
 * deletes the record — if the session is past its absolute lifetime.
 *
 * Called on every authenticated request, so it does exactly one round trip in
 * the common case plus one write to roll the TTL.
 */
export async function touchSession(sid: string | undefined | null): Promise<SessionRecord | null> {
  if (!sid) return null;

  const redis = getRedis();
  const raw = await redis.get(keyFor(sid));
  if (!raw) return null;

  let record: SessionRecord;
  try {
    record = JSON.parse(raw) as SessionRecord;
  } catch {
    await redis.del(keyFor(sid));
    return null;
  }

  const now = Date.now();
  if (now - record.createdAt > sessionAbsoluteSeconds() * 1000) {
    await redis.del(keyFor(sid));
    return null;
  }

  record.lastSeenAt = now;
  await redis.set(keyFor(sid), JSON.stringify(record), 'EX', sessionIdleSeconds());
  return record;
}

/** Read without sliding the window — for endpoints that shouldn't count as activity. */
export async function peekSession(sid: string | undefined | null): Promise<SessionRecord | null> {
  if (!sid) return null;
  const raw = await getRedis().get(keyFor(sid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
}

export async function destroySession(sid: string | undefined | null): Promise<void> {
  if (!sid) return;
  await getRedis().del(keyFor(sid));

  // TODO: cross-device sign-out.
  //
  // Today, sign-out propagates to other tabs via BroadcastChannel (see
  // packages/session-sync). That is origin-scoped and browser-scoped: it cannot
  // reach the same user's phone, their other browser, or an incognito window.
  // Those sessions stay live until their own idle timeout expires.
  //
  // The piece that closes that gap is a server push, and this function is where
  // it starts. Roughly:
  //
  //   1. Publish here, right after the DEL:
  //        await getRedis().publish(`user:${record.userId}:events`,
  //                                 JSON.stringify({ type: 'logout', at: Date.now() }))
  //      That needs the record, so read it before deleting rather than after.
  //      Note this revokes ONE session; signing out every device means
  //      tracking the user's session ids in a `user:<id>:sessions` set and
  //      DEL-ing the lot.
  //
  //   2. Add app/api/session/stream/route.ts — a Node-runtime handler holding
  //      an SSE response open. It resolves the session, SUBSCRIBEs to that
  //      user's channel on a SECOND Redis connection (a subscribed ioredis
  //      client can't run normal commands, so it cannot be the shared one from
  //      lib/redis.ts), and writes an event per message. Send a periodic
  //      comment frame to survive idle-connection reapers, and clean up on
  //      request.signal abort or the subscription leaks per dropped client.
  //
  //   3. Have SessionSync open an EventSource to that endpoint alongside the
  //      BroadcastChannel, and treat a server 'logout' event exactly like a
  //      broadcast one. The `at` field on SessionLogoutMessage exists so a tab
  //      can ignore an event that predates what it has already acted on.
  //
  // Not built yet on purpose — it adds a long-lived connection per open tab, a
  // second Redis connection per connected client, and a reconnect story, none
  // of which is worth it until cross-device revocation is an actual
  // requirement rather than a nice idea.
}

/**
 * Login always lands here: any pre-existing session id is destroyed and a brand
 * new one is issued, so a session id fixed by an attacker before login is worth
 * nothing after it.
 */
export async function rotateSessionOnLogin(
  previousSid: string | undefined | null,
  user: NewSessionInput,
): Promise<string> {
  await destroySession(previousSid);
  return createSession(user);
}
