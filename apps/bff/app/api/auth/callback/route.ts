import type { NextRequest } from 'next/server';
import { getAuthProvider } from '@/lib/auth/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** OIDC redirect target. Exempt from the CSRF origin check — see lib/csrf.ts. */
export async function GET(req: NextRequest) {
  const provider = await getAuthProvider();
  return provider.handleCallback(req);
}
