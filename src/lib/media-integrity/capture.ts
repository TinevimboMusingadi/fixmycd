/**
 * In-app capture tokens. When someone opens the app's own camera or recorder, the server issues
 * a short-lived token bound to their account; the upload sends it back. A valid token means the
 * file was most likely captured live rather than picked from a gallery. It is a supporting sign,
 * not proof: a determined user controls their own device.
 */
import crypto from 'crypto';

const TTL_MS = 15 * 60 * 1000;
let fallbackSecret: string | null = null;

function secret(): string {
  const configured = process.env.CAPTURE_TOKEN_SECRET || process.env.UNSUBSCRIBE_SECRET;
  if (configured) return `capture:${configured}`;
  // Without a configured secret tokens only verify on the instance that issued them.
  fallbackSecret ??= crypto.randomBytes(32).toString('hex');
  return fallbackSecret;
}

const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export function issueCaptureToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now}.${crypto.randomBytes(9).toString('base64url')}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export function verifyCaptureToken(token: string | null | undefined, userId: string, now = Date.now()): boolean {
  if (!token || token.length > 300) return false;
  const [p64, mac] = token.split('.');
  if (!p64 || !mac) return false;
  const payload = Buffer.from(p64, 'base64url').toString();
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  const [uid, issued] = payload.split('.');
  const age = now - Number(issued);
  return uid === userId && Number.isFinite(age) && age >= 0 && age <= TTL_MS;
}
