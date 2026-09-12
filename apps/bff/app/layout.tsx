import type { Metadata } from 'next';
import { SessionSync } from '@bff/session-sync';
import './globals.css';

export const metadata: Metadata = {
  title: 'BFF',
  description: 'Backend-for-frontend shell for Connect, IIF and Handbook',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Renders nothing. Follows a sign-out that happened in another tab. */}
        <SessionSync />
        {children}
      </body>
    </html>
  );
}
