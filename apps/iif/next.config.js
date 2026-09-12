const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Every route and asset is served under this prefix, which is also the path
  // the BFF proxies. Nothing has to be rewritten in between.
  basePath: '/iif',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@bff/internal-auth', '@bff/session-sync'],
  poweredByHeader: false,
};

module.exports = nextConfig;
