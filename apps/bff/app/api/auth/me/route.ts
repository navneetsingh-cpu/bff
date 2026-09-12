import { NextResponse, type NextRequest } from 'next/server';
import { readSessionId } from '@/lib/cookies';
import { touchSession } from '@/lib/session';
import { authMode } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The only identity endpoint the browser talks to. Returns 200 with
 * `authenticated: false` rather than 401 so the home page can render a signed-out
 * state without treating it as an error.
 */
export async function GET(req: NextRequest) {
  const session = await touchSession(readSessionId(req));

  if (!session) {
    return NextResponse.json(
      { authenticated: false, authMode: authMode() },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      authMode: authMode(),
      user: {
        userId: session.userId,
        email: session.email,
        name: session.name,
        roles: session.roles,
      },
      session: {
        createdAt: new Date(session.createdAt).toISOString(),
        lastSeenAt: new Date(session.lastSeenAt).toISOString(),
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
