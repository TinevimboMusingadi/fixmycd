import { afterEach, describe, expect, it, vi } from 'vitest';
import { LruCache, stableKey } from '@/lib/lru';
import { clientIp } from '@/lib/http';
import { isAllowedMediaUrl, ownBlobHost } from '@/lib/media-url';
import { paymentsDemoEnabled } from '@/lib/payments-demo';
import { buildCsp } from '@/lib/csp';

afterEach(() => vi.unstubAllEnvs());

describe('LruCache', () => {
  it('evicts the least recently used entry past its size', () => {
    const c = new LruCache<number>(2);
    c.set('a', 1, 60_000);
    c.set('b', 2, 60_000);
    c.get('a');
    c.set('c', 3, 60_000);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.size).toBe(2);
  });
  it('expires entries', () => {
    const c = new LruCache<number>(5);
    c.set('a', 1, -1);
    expect(c.get('a')).toBeUndefined();
  });
  it('builds the same key regardless of property order', () => {
    expect(stableKey({ b: 1, a: { d: 2, c: 3 } })).toBe(stableKey({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe('clientIp', () => {
  const req = (h: Record<string, string>) => new Request('http://x/', { headers: h });
  it('ignores forwarding headers unless a proxy is trusted', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUST_PROXY', '');
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe('direct');
  });
  it('uses the first hop behind a trusted proxy', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', '1');
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
  });
  it("prefers Vercel's own header on Vercel", () => {
    vi.stubEnv('VERCEL', '1');
    expect(clientIp(req({ 'x-vercel-forwarded-for': '5.6.7.8', 'x-forwarded-for': '9.9.9.9' }))).toBe('5.6.7.8');
  });
});

describe('media allowlist pinned to our Blob store', () => {
  it('derives the store host from the token', () => {
    expect(ownBlobHost({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_AbC123_secret' })).toBe('abc123.public.blob.vercel-storage.com');
    expect(ownBlobHost({ BLOB_PUBLIC_HOST: 'Mine.public.blob.vercel-storage.com' })).toBe('mine.public.blob.vercel-storage.com');
    expect(ownBlobHost({})).toBeNull();
  });
  it("rejects another customer's Blob store once ours is known", () => {
    vi.stubEnv('BLOB_PUBLIC_HOST', 'ours.public.blob.vercel-storage.com');
    expect(isAllowedMediaUrl('https://ours.public.blob.vercel-storage.com/a.jpg', 'image')).toBe(true);
    expect(isAllowedMediaUrl('https://attacker.public.blob.vercel-storage.com/a.jpg', 'image')).toBe(false);
  });
});

describe('demo payments switch', () => {
  it('is off in production unless asked for', () => {
    expect(paymentsDemoEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(paymentsDemoEnabled({ NODE_ENV: 'production', PAYMENTS_DEMO: '1' })).toBe(true);
    expect(paymentsDemoEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(paymentsDemoEnabled({ NODE_ENV: 'test', PAYMENTS_DEMO: '0' })).toBe(false);
  });
});

describe('CSP', () => {
  it('allows scripts only by nonce in production', () => {
    const csp = buildCsp('abc');
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(buildCsp('abc', { dev: true })).toContain("'unsafe-eval'");
  });
});
