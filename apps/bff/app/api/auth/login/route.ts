import type { NextRequest } from 'next/server';
import { getAuthProvider } from '@/lib/auth/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** stub: renders the user picker. oidc: redirects to Entra with PKCE. */
export async function GET(req: NextRequest) {
  const provider = await getAuthProvider();
  return provider.startLogin(req);
}

/** stub: creates the session from the picked user. oidc: 405. */
export async function POST(req: NextRequest) {
  const provider = await getAuthProvider();
  return provider.submitLogin(req);
}
