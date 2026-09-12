import type { ReactNode } from 'react'

export const metadata = { title: 'BFF' }

export default function RootLayout({ children }: { children: ReactNode }) {
  // Next stamps its own bundles with the nonce from the request-side CSP header
  // set in middleware; components needing it can read headers().get('x-nonce').
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
