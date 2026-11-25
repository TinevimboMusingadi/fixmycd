/** Same rules as the web app's formatRelativeTime / handleFor (src/lib/utils.ts). */
export function relativeTime(date: string | Date, compact = true, now = new Date()): string {
  const past = new Date(date);
  if (Number.isNaN(past.getTime())) return '';
  const s = Math.floor((now.getTime() - past.getTime()) / 1000);
  const ago = compact ? '' : ' ago';
  if (s < 60) {
    if (s > -60) return compact ? 'now' : 'just now';
    return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${ago}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${ago}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d${ago}`;
  const sameYear = past.getFullYear() === now.getFullYear();
  return past.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fullDate(date: string | Date): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' });
}

export function handleFor(displayName: string | null | undefined): string {
  const slug = (displayName ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
  return slug.slice(0, 24) || 'citizen';
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}

/** Compact counts: 1.2K, 3.4M. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function usd(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function percent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '0%';
  return `${Math.round(ratio * 100)}%`;
}

const AVATAR_COLORS = ['#8b5cf6', '#6d28d9', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#a855f7'];

/** Stable avatar colour per person. */
export function avatarColor(seed: string | null | undefined): string {
  const s = seed ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
