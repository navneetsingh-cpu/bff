const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Every route and asset is served under this prefix, which is also the path
  // the BFF proxies. Nothing has to be rewritten in between.
  basePath: '/iif',
  transpilePackages: ['@bff/internal-auth', '@bff/session-sync', '@internal/ui'],
  poweredByHeader: false,
  experimental: {
    // Next reads these from `experimental` in 14.x — a top-level
    // `outputFileTracingRoot` is accepted by the config object and then
    // silently ignored (see next/dist/build/index.js, which reads
    // `config.experimental.outputFileTracingRoot`).
    //
    // Standalone builds in a workspace must trace from the monorepo root,
    // or the hoisted node_modules are left out of the output.
    outputFileTracingRoot: path.join(__dirname, '../../'),
    // Tracing follows imports from compiled output, and @internal/ui is
    // consumed as source that gets inlined — so nothing in the trace points
    // back at the package directory and it never makes it into standalone.
    // Naming it here is what puts it in the runner image.
    outputFileTracingIncludes: {
      '/': ['../../packages/ui/**/*'],
    },
  },
};

module.exports = nextConfig;
