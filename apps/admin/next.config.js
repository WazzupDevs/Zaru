/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace shared-types package — Next needs to transpile it because
  // it ships ESM .js with .d.ts under dist/. Without this, Next 15's
  // bundler trips on the workspace symlink.
  transpilePackages: ["@event-fleet/shared-types"],
  reactStrictMode: true,
  // Type-check + lint run as separate pnpm scripts (turbo gates them);
  // don't double-fail the next build pipeline.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

module.exports = nextConfig;
