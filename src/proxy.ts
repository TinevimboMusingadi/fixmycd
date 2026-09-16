import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const session = request.cookies.get('session_user_id');
  const path = request.nextUrl.pathname;

  // Pages that require authentication
  const protectedPages = [
    '/dashboard/notifications',
    '/dashboard/profile',
    '/dashboard/review',
    '/dashboard/admin',
  ];

  const isProtected = protectedPages.some((page) => path.startsWith(page));

  // If no session and trying to access a protected page → redirect to login
  if (!session?.value && isProtected) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};