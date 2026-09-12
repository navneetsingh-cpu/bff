import type { NextRequest } from 'next/server'
import { redis } from './redis'

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number }

/**
 * Sliding window over a Redis sorted set: drop entries outside the window,
 * record this hit, then count what is left.
 */
export async function rateLimit(
  bucket: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `rl:${bucket}:${identity}`
  const now = Date.now()
  const windowStart = now - windowSeconds * 1000

  const results = await redis()
    .multi()
    .zremrangebyscore(key, 0, windowStart)
    .zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 10)}`)
    .zcard(key)
    .pexpire(key, windowSeconds * 1000)
    .exec()

  const count = Number(results?.[2]?.[1] ?? 0)
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: windowSeconds,
  }
}

/** Left-most X-Forwarded-For hop, falling back to the socket address. */
export function clientIdentity(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? req.ip ?? 'unknown'
}
