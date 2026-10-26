/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { cpus: 1 },
  async headers() {
    return [{source:"/:path*",headers:[
      {key:"Referrer-Policy",value:"no-referrer"},
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"X-Frame-Options",value:"SAMEORIGIN"},
      {key:"Content-Security-Policy",value:"object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self' https://*.midtrans.com; script-src 'self' 'unsafe-inline' https://app.midtrans.com https://app.sandbox.midtrans.com"+(process.env.NODE_ENV==="development"?" 'unsafe-eval'":"")},
    ]}];
  },
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
