import { LruCache } from './lru';

const DEFAULT_TTL_MS = 30_000;
const store = new LruCache<unknown>(500);

export function getCached<T>(key: string): T | null {
  const hit = store.get(key);
  return hit === undefined ? null : (hit as T);
}

export function setCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): T {
  store.set(key, value, ttlMs);
  return value;
}

export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const existing = getCached<T>(key);
  if (existing !== null) return existing;
  const value = await fn();
  return setCached(key, value, ttlMs);
}

export function clearAnalyticsCache() {
  store.clear();
}
