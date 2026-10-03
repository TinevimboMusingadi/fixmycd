import crypto from 'crypto';

/**
 * Hash a user agent string for anonymous dedup tracking.
 * Never store raw user agents — hash with a salt.
 */
export function hashUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const salt = process.env.HASH_SALT || 'fixmydistrict-default-salt';
  return crypto
    .createHash('sha256')
    .update(userAgent + salt)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Reduce a referrer URL to just its hostname to avoid capturing full URLs.
 */
export function extractReferrer(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return url.hostname;
  } catch {
    return null;
  }
}