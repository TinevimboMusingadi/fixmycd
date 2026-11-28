import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCrossSiteMutation } from './lib/csrf';
import { buildCsp, clerkCspHosts, newNonce } from './lib/csp';
import { clerkFrontendApiHost } from './lib/clerk';

// Must match SESSION_COOKIE in src/lib/auth.ts. The proxy only uses it to
// decide whether to redirect to /login; authorization happens server-side.
const SESSION_COOKIE = 'fmd_session';

// Pages that require a signed-in user.
const PROTECTED_PAGES = [
  '/dashboard/notifications',
  '/dashboard/account',
  '/dashboard/review',
  '/dashboard/analytics',
];

const TRUSTED_ORIGINS = [process.env.NEXT_PUBLIC_BASE_URL].filter((v): v is string => !!v);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith('/api/')) {
    if (isCrossSiteMutation(request.method, request.url, request.headers, TRUSTED_ORIGINS)) {
      return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 });
    }
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE);
  const isProtected = PROTECTED_PAGES.some((page) => path.startsWith(page));
  if (!session?.value && isProtected) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(loginUrl);
  }

  // Pages: enforced CSP with a per-request nonce. Next reads the nonce from the request's
  // CSP header and stamps it on its scripts; the root layout uses x-nonce for its own.
  const nonce = newNonce();
  // Clerk's widget only loads on the sign-in pages, so only they allow its hosts.
  const clerkPage = path === '/login' || path === '/signup' || path.startsWith('/auth/');
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === 'development',
    ...(clerkPage ? clerkCspHosts(clerkFrontendApiHost()) : {}),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    {
      // Every page except static files and prefetches (which carry no scripts).
      source: '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt|xml|js|css|woff2?)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
