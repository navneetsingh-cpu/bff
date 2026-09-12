import type { NextRequest } from 'next/server';
import { proxyToSubApp } from '@/lib/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `/handbook/:path*` -> `http://handbook:3000/handbook/:path*`, plus auth. See lib/proxy.ts. */
const handler = (req: NextRequest) => proxyToSubApp(req, 'handbook');

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
