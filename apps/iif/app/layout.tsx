import type { Metadata } from 'next';
import { LogoutButton, SessionSync } from '@bff/session-sync';
import './globals.css';

export const metadata: Metadata = {
  title: 'IIF',
  description: 'Intake form workflow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Renders nothing. Follows a sign-out that happened in another tab. */}
        <SessionSync />
        <header className="app-header">
          <span className="app-header__title">IIF</span>
          {/* Posts to the BFF's /api/auth/logout — a plain form action, so
              basePath does not rewrite it to /iif/api/auth/logout. */}
          <LogoutButton />
        </header>
        {children}
      </body>
    </html>
  );
}
