import type { NextRequest } from 'next/server';
import { proxyToSubApp } from '@/lib/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Replaces what would otherwise be a next.config.js rewrite of
 * `/connect/:path*` -> `http://connect:3000/connect/:path*`, with session
 * lookup and assertion minting layered on. See lib/proxy.ts.
 */
const handler = (req: NextRequest) => proxyToSubApp(req, 'connect');

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
