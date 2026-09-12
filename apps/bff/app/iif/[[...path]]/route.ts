import type { NextRequest } from 'next/server';
import { proxyToSubApp } from '@/lib/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `/iif/:path*` -> `http://iif:3000/iif/:path*`, plus auth. See lib/proxy.ts. */
const handler = (req: NextRequest) => proxyToSubApp(req, 'iif');

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
