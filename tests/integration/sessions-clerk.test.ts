import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { Webhook } from 'svix';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as listSessions, DELETE as deleteSessions } from '@/app/api/auth/sessions/route';
import { POST as clerkExchange } from '@/app/api/auth/clerk/route';
import { POST as verify } from '@/app/api/verify/route';
import { POST as clerkWebhook } from '@/app/api/webhooks/clerk/route';
import { call } from '../helpers/route';
import { cookieJar } from '../helpers/cookie-jar';
import { createUser } from '../helpers/factories';
import { loginAs } from '../helpers/session';
import type { ClerkIdentity } from '@/lib/clerk';

// Clerk is replaced by a stand-in: tests decide who a "Clerk token" belongs to.
const identities = new Map<string, ClerkIdentity>();
vi.mock('@/lib/clerk', async (orig) => ({
  ...(await orig<typeof import('@/lib/clerk')>()),
  clerkConfigured: () => true,
  verifyClerkUser: async (token: string) => identities.get(token) ?? null,
}));

const mobile = { 'x-client': 'mobile-app', 'user-agent': 'okhttp/4.12 (Android)' };
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const card = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', name: 'Test Person' };

beforeEach(() => identities.clear());

describe('mobile bearer sessions', () => {
  it('returns a token (and no cookie) to the app, which then authenticates with it', async () => {
    const user = await createUser();
    cookieJar.clear();
    const res = await call(login, { method: 'POST', body: { email: user.email, password: user.password }, headers: mobile });
    expect(res.status).toBe(200);
    expect(res.json.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(cookieJar.get('fmd_session')).toBeUndefined();

    const who = await call(me, { headers: bearer(res.json.token) });
    expect(who.json.user.id).toBe(user.id);
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(row).toMatchObject({ client: 'mobile', authMethod: 'password', userAgent: 'FixMyDistrict app · Android' });

    await call(logout, { method: 'POST', headers: bearer(res.json.token) });
    expect((await call(me, { headers: bearer(res.json.token) })).status).toBe(401);
  });

  it('ends a session that has been idle too long', async () => {
    const user = await createUser();
    cookieJar.clear();
    await loginAs(user.email, user.password);
    await db.update(sessions).set({ lastSeenAt: new Date(Date.now() - 4 * 86_400_000) }).where(eq(sessions.userId, user.id));
    expect((await call(me)).status).toBe(401);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
  });
});

describe('signed-in devices', () => {
  it('lists devices and signs out others, but only the owner’s', async () => {
    const user = await createUser();
    cookieJar.clear();
    const phone = await call(login, { method: 'POST', body: { email: user.email, password: user.password }, headers: mobile });
    await loginAs(user.email, user.password);
    const list = await call(listSessions);
    expect(list.json).toHaveLength(2);
    expect(list.json.filter((d: { current: boolean }) => d.current)).toHaveLength(1);

    // Someone else can't remove this user's sessions.
    const other = await createUser();
    const otherLogin = await call(login, { method: 'POST', body: { email: other.email, password: other.password }, headers: mobile });
    const victimId = list.json.find((d: { current: boolean }) => !d.current).id;
    expect((await call(deleteSessions, { method: 'DELETE', body: { id: victimId }, headers: bearer(otherLogin.json.token) })).status).toBe(404);

    expect((await call(deleteSessions, { method: 'DELETE', body: { others: true } })).json.removed).toBe(1);
    expect((await call(me, { headers: bearer(phone.json.token) })).status).toBe(401);
    expect((await call(me)).status).toBe(200);
  });
});

describe('Clerk sign-in (Google / LinkedIn / Facebook)', () => {
  const google = (overrides: Partial<ClerkIdentity> = {}): ClerkIdentity => ({
    clerkUserId: 'user_clerk_1',
    email: 'maya@example.test',
    emailVerified: true,
    phoneVerified: false,
    provider: 'google',
    displayName: 'Maya J',
    ...overrides,
  });

  it('walks a new person through ethics, phone and verification before any session exists', async () => {
    cookieJar.clear();
    identities.set('clerk-session-token-1-xxxxxxxx', google());
    const ex = (body: Record<string, unknown> = {}) => call(clerkExchange, { method: 'POST', body: { token: 'clerk-session-token-1-xxxxxxxx', ...body } });

    expect((await ex()).json.status).toBe('needs_ethics');
    expect(await db.select().from(users).where(eq(users.email, 'maya@example.test'))).toHaveLength(0);

    expect((await ex({ acceptEthics: true })).json.status).toBe('needs_phone');
    const [created] = await db.select().from(users).where(eq(users.email, 'maya@example.test'));
    expect(created).toMatchObject({ status: 'pending', role: 'submitter', clerkUserId: 'user_clerk_1', authProvider: 'google', passwordHash: null });
    expect(cookieJar.get('fmd_session')).toBeUndefined();

    // The $1 check needs the phone first.
    expect((await call(verify, { method: 'POST', body: { clerkToken: 'clerk-session-token-1-xxxxxxxx', card } })).status).toBe(403);

    identities.set('clerk-session-token-1-xxxxxxxx', google({ phoneVerified: true }));
    const pending = await ex();
    expect(pending.json).toMatchObject({ status: 'pending', canVerifyByCard: true });

    const paid = await call(verify, { method: 'POST', body: { clerkToken: 'clerk-session-token-1-xxxxxxxx', card } });
    expect(paid.status).toBe(200);
    expect(cookieJar.get('fmd_session')).toBeTruthy();
    expect((await ex()).json.status).toBe('signed_in');
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, created.id)).limit(1);
    expect(row.authMethod).toMatch(/card_demo|clerk:google/);
  });

  it('links an approved password account by verified email and signs in at once', async () => {
    const existing = await createUser({ email: 'sam@example.test' });
    cookieJar.clear();
    identities.set('clerk-session-token-2-xxxxxxxx', google({ clerkUserId: 'user_clerk_2', email: 'sam@example.test', provider: 'linkedin_oidc' }));
    const res = await call(clerkExchange, { method: 'POST', body: { token: 'clerk-session-token-2-xxxxxxxx' }, headers: mobile });
    expect(res.json.status).toBe('signed_in');
    expect(res.json.token).toBeTruthy();
    const [u] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(u.clerkUserId).toBe('user_clerk_2');
  });

  it('refuses unverified emails, unknown tokens and a second Clerk identity on one account', async () => {
    identities.set('clerk-session-token-3-xxxxxxxx', google({ clerkUserId: 'user_clerk_3', email: 'x@example.test', emailVerified: false }));
    expect((await call(clerkExchange, { method: 'POST', body: { token: 'clerk-session-token-3-xxxxxxxx' } })).status).toBe(403);
    expect((await call(clerkExchange, { method: 'POST', body: { token: 'not-a-real-clerk-token' } })).status).toBe(401);

    await createUser({ email: 'taken@example.test', clerkUserId: 'user_clerk_A' });
    identities.set('clerk-session-token-4-xxxxxxxx', google({ clerkUserId: 'user_clerk_B', email: 'taken@example.test' }));
    expect((await call(clerkExchange, { method: 'POST', body: { token: 'clerk-session-token-4-xxxxxxxx' } })).status).toBe(409);
  });

  it('disables the account and ends sessions when the Clerk user is deleted (signed webhook)', async () => {
    const secret = 'whsec_' + Buffer.from('test-webhook-secret-123456').toString('base64');
    vi.stubEnv('CLERK_WEBHOOK_SECRET', secret);
    const user = await createUser({ clerkUserId: 'user_clerk_del' });
    cookieJar.clear();
    await loginAs(user.email, user.password);

    const payload = JSON.stringify({ type: 'user.deleted', data: { id: 'user_clerk_del', deleted: true } });
    const id = 'msg_1';
    const ts = new Date();
    const signature = new Webhook(secret).sign(id, ts, payload);
    const headers = { 'svix-id': id, 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': signature };

    expect((await call(clerkWebhook, { method: 'POST', rawBody: payload, headers: { ...headers, 'svix-signature': 'v1,bad' } })).status).toBe(401);
    expect((await call(clerkWebhook, { method: 'POST', rawBody: payload, headers })).status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    expect(u.disabledAt).not.toBeNull();
    expect((await call(me)).status).toBe(401);
    vi.unstubAllEnvs();
  });
});
