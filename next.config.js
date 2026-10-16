/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.module.rules.push({ test: /offline\.html$/, type: "asset/source" });
    return config;
  },
  // Keep production-browser verification isolated from an active `next dev`.
  distDir: process.env.SELFORDER_BUILD_DIR || ".next",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // No ignoreBuildErrors — we fix all errors properly
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
