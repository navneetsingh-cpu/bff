const path = require('path')

/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',
  basePath: '/hr',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@internal/auth'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async headers() {
    // The BFF owns the per-request nonce CSP; these are the static defences that
    // still apply to responses served straight out of this app.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'" },
        ],
      },
    ]
  },
}
