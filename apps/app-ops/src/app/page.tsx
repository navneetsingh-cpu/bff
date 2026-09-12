import { headers } from 'next/headers'
import { INTERNAL_ASSERTION_HEADER, verifyInternalAssertion } from '@internal/auth'

export const dynamic = 'force-dynamic'

export default async function Protected() {
  // Identity comes from the assertion only. Middleware has already rejected
  // requests without a valid one; this re-read is what populates the page.
  const assertion = headers().get(INTERNAL_ASSERTION_HEADER)!
  const claims = await verifyInternalAssertion(assertion, 'app-ops')

  return (
    <main>
      <h1>Ops</h1>
      <p>oid: {claims.oid}</p>
      <p>roles: {claims.roles.join(', ') || 'none'}</p>
    </main>
  )
}
