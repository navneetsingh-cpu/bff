const path = require('path')

/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages are consumed from source.
  transpilePackages: ['@internal/auth'],
  // Required so standalone tracing picks up the pnpm workspace root.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async rewrites() {
    // Declarative fallback for internal app traffic. Note that the catch-all
    // route handlers at src/app/hr/[...path] and src/app/ops/[...path] match
    // first (afterFiles rewrites run after filesystem routes) and are what
    // actually carries the X-Internal-Assertion. These entries exist so the
    // routing table still resolves if the proxy routes are removed.
    return [
      { source: '/hr/:path*', destination: 'http://app-hr:3000/hr/:path*' },
      { source: '/ops/:path*', destination: 'http://app-ops:3000/ops/:path*' },
    ]
  },
}
