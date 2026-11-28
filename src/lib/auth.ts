import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import { sessions, users } from '../db/schema';

/** Cookie holding the opaque session token. */
export const SESSION_COOKIE = 'fmd_session';
/** Pre-October cookie that stored the raw user id. Never trusted; cleared on login/logout. */
export const LEGACY_SESSION_COOKIE = 'session_user_id';

/** bcrypt cost for newly created password hashes (existing hashes keep verifying). */
export const PASSWORD_HASH_COST = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Session lifetimes. Web: 7 days at most, and 3 days without use ends it. The phone app keeps its
 * token in the device's secure storage (Keychain / Keystore): 30 days at most, 14 idle.
 */
export const SESSION_POLICY = {
  web: { ttlMs: 7 * DAY_MS, idleMs: 3 * DAY_MS },
  mobile: { ttlMs: 30 * DAY_MS, idleMs: 14 * DAY_MS },
} as const;
export type SessionClient = keyof typeof SESSION_POLICY;
const SESSION_TTL_MS = SESSION_POLICY.web.ttlMs;
const LAST_SEEN_RESOLUTION_MS = 15 * 60 * 1000;
/** Header the phone app sends so login returns a bearer token instead of setting a cookie. */
export const MOBILE_CLIENT_HEADER = 'x-client';

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_TTL_MS / 1000,
};

/** Columns a request may know about the signed-in user (never the password hash). */
const sessionUserColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.role,
  status: users.status,
  bio: users.bio,
  emailNotifications: users.emailNotifications,
  isSynthetic: users.isSynthetic,
  createdAt: users.createdAt,
};

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  bio: string | null;
  emailNotifications: boolean;
  isSynthetic: boolean;
  createdAt: Date;
};

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Short, non-identifying description of the device for the "Signed-in devices" list. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  if (/okhttp|FixMyDistrict|Expo|ReactNative/i.test(ua)) return /android/i.test(ua) ? 'FixMyDistrict app · Android' : /iphone|ios|darwin|cfnetwork/i.test(ua) ? 'FixMyDistrict app · iPhone' : 'FixMyDistrict app';
  const os = /iphone|ipad/i.test(ua) ? 'iPhone' : /android/i.test(ua) ? 'Android' : /mac os/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : /linux/i.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /edg\//i.test(ua) ? 'Edge' : /firefox|fxios/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${browser} · ${os}`;
}

/** Does this request come from the phone app (wants a bearer token rather than a cookie)? */
export function isMobileClient(request: Request): boolean {
  return request.headers.get(MOBILE_CLIENT_HEADER) === 'mobile-app';
}

/**
 * Start a session. Web: sets the httpOnly cookie. Mobile: returns the token for the app to keep in
 * secure storage (no cookie). Route handlers only.
 */
export async function createSession(
  userId: string,
  opts: { client?: SessionClient; method?: string; userAgent?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const client = opts.client ?? 'web';
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_POLICY[client].ttlMs);
  await db.insert(sessions).values({
    id: hashSessionToken(token),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    client,
    authMethod: opts.method ?? 'password',
    userAgent: describeUserAgent(opts.userAgent),
  });
  // Opportunistic cleanup of this user's expired sessions.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)));

  if (client === 'web') {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    cookieStore.delete(LEGACY_SESSION_COOKIE);
  }
  return { token, expiresAt };
}

/** The session token on this request: the cookie, or the app's `Authorization: Bearer` header. */
export async function currentSessionToken(): Promise<string | null> {
  // An explicit bearer token (the phone app) wins over any cookie the device may still hold.
  const auth = (await headers()).get('authorization');
  const m = auth ? /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(auth) : null;
  if (m) return m[1];
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** End the current session (if any) and clear cookies. Route handlers only. */
export async function destroySession(): Promise<void> {
  const token = await currentSessionToken();
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(LEGACY_SESSION_COOKIE);
}

/** Sign a user out everywhere (used when an account is disabled, rejected or its role changes). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * The signed-in user, or null. Only active sessions of approved, enabled
 * accounts count. Safe to call from Server Components (never writes cookies).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await currentSessionToken();
  if (!token || token.length > 128) return null;

  const now = new Date();
  const rows = await db
    .select({ ...sessionUserColumns, sessionId: sessions.id, lastSeenAt: sessions.lastSeenAt, client: sessions.client })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, hashSessionToken(token)),
        gt(sessions.expiresAt, now),
        isNull(users.disabledAt),
        eq(users.status, 'approved')
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Unused for too long: the session has ended (a stolen, forgotten token stops working).
  const policy = SESSION_POLICY[(row.client as SessionClient) in SESSION_POLICY ? (row.client as SessionClient) : 'web'];
  if (now.getTime() - row.lastSeenAt.getTime() > policy.idleMs) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  if (now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
  }

  const { sessionId: _sessionId, lastSeenAt: _lastSeenAt, client: _client, ...user } = row;
  return user;
}

export function isModerator(role: string) {
  return role === 'referee' || role === 'admin' || role === 'super_admin';
}

export function isAdmin(role: string) {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin(role: string) {
  return role === 'super_admin';
}

export function isExpert(role: string) {
  return role === 'referee' || role === 'admin' || role === 'super_admin';
}

export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}

export async function requireExpert(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isExpert(user.role)) {
    return NextResponse.json(
      { error: 'Forbidden — expert access required' },
      { status: 403 }
    );
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }
  return user;
}

export async function requireModerator(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isModerator(user.role)) {
    return NextResponse.json({ error: 'Forbidden — moderator access required' }, { status: 403 });
  }
  return user;
}

/** Viewers are read-only accounts: they can browse, upvote and flag, but not post, comment or upload. */
export function canContribute(role: string) {
  return role !== 'viewer';
}

export const readOnlyAccount = () =>
  NextResponse.json({ error: 'Your account is read-only. Ask an admin for posting access.' }, { status: 403 });

export function isAuthError(value: SessionUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
