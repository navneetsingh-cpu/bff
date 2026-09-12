import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SessionSync } from '@bff/session-sync';
import { AppHeader } from '@internal/ui';
import { verifyRequestIdentity } from '@/lib/identity';
import './globals.css';

export const metadata: Metadata = {
  title: 'Connect',
  description: 'People and org directory',
};

/**
 * Async because the header needs a user, and this app only ever learns who
 * the caller is from the verified assertion. The header itself never
 * fetches — it renders what the layout already read.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const result = await verifyRequestIdentity(headers());
  const user = result.ok ? { name: result.identity.name, email: result.identity.email } : null;

  return (
    <html lang="en">
      <body>
        {/* Renders nothing. Follows a sign-out that happened in another tab. */}
        <SessionSync />
        <AppHeader currentZone="connect" user={user} />
        {children}
      </body>
    </html>
  );
}
