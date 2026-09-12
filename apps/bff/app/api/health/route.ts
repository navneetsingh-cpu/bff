import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness only. Touches no Redis, no upstream, no session — a failing
 * dependency must not take the container out of rotation, and a health check
 * must never be the thing that opens a Redis connection.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'bff', time: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
