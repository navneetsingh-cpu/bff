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
