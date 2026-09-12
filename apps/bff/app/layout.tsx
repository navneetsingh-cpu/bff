import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BFF',
  description: 'Backend-for-frontend shell for Connect, IIF and Handbook',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
