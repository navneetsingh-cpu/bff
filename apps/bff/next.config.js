const path = require('path');

/**
 * Why there are no `rewrites()` here.
 *
 * The obvious shape for this file is:
 *
 *   rewrites: () => [
 *     { source: '/connect/:path*',  destination: 'http://connect:3000/connect/:path*' },
 *     { source: '/iif/:path*',      destination: 'http://iif:3000/iif/:path*' },
 *     { source: '/handbook/:path*', destination: 'http://handbook:3000/handbook/:path*' },
 *   ]
 *
 * Declarative rewrites can't do the one thing this proxy exists for: look the
 * caller's session up in Redis and attach a freshly minted, per-request
 * assertion. Middleware can add headers ahead of a rewrite, but middleware runs
 * on the Edge runtime in Next 14, where ioredis can't run.
 *
 * So the same three routes are served by catch-all Route Handlers on the Node
 * runtime instead — app/connect/[[...path]]/route.ts and friends. They proxy to
 * exactly the destinations above (see lib/upstreams.ts), and additionally strip
 * spoofed identity headers and mint X-Internal-Assertion. Same URL contract,
 * same upstreams, one layer that can actually authenticate.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Standalone builds in a workspace must trace from the monorepo root, or the
  // hoisted node_modules are left out of the output.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // The shared package ships TypeScript source, so Next compiles it in-place.
  transpilePackages: ['@bff/internal-auth', '@bff/session-sync'],
  poweredByHeader: false,
};

module.exports = nextConfig;
