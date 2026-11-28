import { ownBlobHost } from './media-url';

/**
 * Content-Security-Policy for pages, enforced with a fresh nonce per request (set by src/proxy.ts).
 * Scripts run only if they carry the nonce (Next adds it to its own scripts), so injected
 * markup can't execute script even if some other bug lets it into the page.
 * Hosts: map tiles (OpenStreetMap), Google Fonts, and the media allowlist in src/lib/media-url.ts.
 */
export function buildCsp(
  nonce: string,
  opts: { dev?: boolean; extraConnect?: string[]; extraScript?: string[]; extraFrame?: string[]; extraImg?: string[] } = {}
): string {
  const blob = ownBlobHost();
  const blobSrc = blob ? `https://${blob}` : 'https://*.public.blob.vercel-storage.com';
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce'd scripts load Next's chunks; 'self' is the fallback for old browsers.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ''}${(opts.extraScript ?? []).map((h) => ` ${h}`).join('')}`,
    // Inline style attributes (React style={...}, Leaflet) need 'unsafe-inline'; styles can't run code.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: https://*.tile.openstreetmap.org https://images.unsplash.com ${blobSrc} https://maps.googleapis.com${(opts.extraImg ?? []).map((h) => ` ${h}`).join('')}`,
    `media-src 'self' data: blob: ${blobSrc}`,
    `connect-src 'self'${(opts.extraConnect ?? []).map((h) => ` ${h}`).join('')}`,
    `frame-src 'self'${(opts.extraFrame ?? []).map((h) => ` ${h}`).join('')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!opts.dev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/**
 * Extra hosts for Clerk's sign-in widget (only on the sign-in pages, and only when Clerk is set up):
 * its Frontend API, avatars, and Cloudflare's bot check that Clerk uses on sign-up.
 */
export function clerkCspHosts(frontendApiHost: string | null) {
  if (!frontendApiHost) return {};
  const fapi = `https://${frontendApiHost}`;
  return {
    extraScript: [fapi, 'https://challenges.cloudflare.com'],
    extraConnect: [fapi, 'https://clerk-telemetry.com'],
    extraFrame: ['https://challenges.cloudflare.com'],
    extraImg: ['https://img.clerk.com'],
  };
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
