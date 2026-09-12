import type { NextRequest } from 'next/server'
import { proxyToApp } from '@/lib/proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Optional catch-all so /ops and /ops/<anything> both reach the proxy.
const handler = (req: NextRequest) => proxyToApp(req, 'app-ops')

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
}
