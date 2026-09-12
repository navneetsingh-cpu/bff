import { cookies } from 'next/headers'
import { SESSION_COOKIE, getSession } from '@/lib/session'
import { LogoutButton } from './logout-button'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getSession(cookies().get(SESSION_COOKIE)?.value)

  if (!session) {
    return (
      <main>
        <h1>BFF</h1>
        <a href="/api/auth/login">Sign in</a>
      </main>
    )
  }

  return (
    <main>
      <h1>Signed in as {session.claims.name ?? session.claims.sub}</h1>
      <nav>
        <a href="/hr">HR</a> · <a href="/ops">Ops</a>
      </nav>
      <LogoutButton />
    </main>
  )
}
