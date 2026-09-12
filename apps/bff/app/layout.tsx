import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SessionSync } from '@bff/session-sync';
import { AppHeader } from '@internal/ui';
import { sessionCookieName } from '@/lib/env';
import { peekSession } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'BFF',
  description: 'Backend-for-frontend shell for Connect, IIF and Handbook',
};

/**
 * Async because the header needs a user. `peekSession` reads the record
 * without bumping `lastSeenAt` — rendering a header is not activity, and the
 * idle timeout should not be reset by it.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await peekSession(cookies().get(sessionCookieName())?.value);
  const user = session ? { name: session.name, email: session.email } : null;

  return (
    <html lang="en">
      <body>
        {/* Renders nothing. Follows a sign-out that happened in another tab. */}
        <SessionSync />
        <AppHeader currentZone="home" user={user} />
        {children}
      </body>
    </html>
  );
}
