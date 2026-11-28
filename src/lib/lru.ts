/**
 * Small LRU map with expiry. Bounded so request-driven keys (query strings, bounding boxes)
 * can't grow server memory without limit.
 */
export class LruCache<V> {
  private store = new Map<string, { value: V; expiresAt: number }>();

  constructor(private readonly maxEntries = 500) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Re-insert so it becomes the most recently used.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs: number): V {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
    return value;
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

/** Stable JSON for cache keys: object keys sorted, so equal filters give equal keys. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}
