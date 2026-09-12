import { NextResponse, type NextRequest } from 'next/server'
import { INTERNAL_ASSERTION_HEADER, verifyInternalAssertion } from '@internal/auth'

const AUDIENCE = 'app-hr' as const

/**
 * The only way into this app is through the BFF proxy carrying a signed,
 * audience-bound, 60s assertion. No other header is trusted for identity.
 */
export async function middleware(req: NextRequest) {
  const assertion = req.headers.get(INTERNAL_ASSERTION_HEADER)
  if (!assertion) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    await verifyInternalAssertion(assertion, AUDIENCE)
  } catch {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/health|_next/static|_next/image|favicon.ico).*)'],
}
