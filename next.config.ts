import type { NextConfig } from 'next';

// The Content-Security-Policy is set per request (with a nonce) in src/proxy.ts via src/lib/csp.ts.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The report form uses the camera, microphone and location of this site only.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()' },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
  poweredByHeader: false,
  // Native modules (Content Credentials reader, image processing) are loaded with Node's require.
  serverExternalPackages: ['@contentauth/c2pa-node', 'sharp'],
  env: {
    // Versions the service worker cache so each deploy starts clean.
    NEXT_PUBLIC_APP_VERSION:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.NEXT_PUBLIC_APP_VERSION || `build-${Date.now()}`,
  },
  // Pages that moved. Query strings (e.g. analytics filters) are carried over.
  async redirects() {
    return [
      { source: '/dashboard/admin/analytics', destination: '/dashboard/analytics', permanent: false },
      { source: '/dashboard/admin', destination: '/dashboard/account/users', permanent: false },
      // Older notification emails link here for email settings.
      { source: '/dashboard/profile', destination: '/dashboard/account/profile', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
