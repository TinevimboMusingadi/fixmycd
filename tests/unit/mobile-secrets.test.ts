import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Anything in the mobile app ships inside the APK/IPA, where anyone holding the binary can read it.
 * Only public identifiers (the API URL, Clerk's *publishable* key) may appear there; never secrets.
 */
const ROOT = path.resolve(__dirname, '../../mobile');
const SECRET_PATTERNS: [RegExp, string][] = [
  [/sk_(live|test)_[A-Za-z0-9]{10,}/, 'Clerk secret key'],
  [/CLERK_SECRET_KEY|CLERK_WEBHOOK_SECRET/, 'Clerk server secret name'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/GEMINI_API_KEY|OPENAI_API_KEY|BLOB_READ_WRITE_TOKEN|DATABASE_URL|HASH_SALT|UNSUBSCRIBE_SECRET/, 'server-only setting'],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'private key'],
  [/whsec_[A-Za-z0-9]{10,}/, 'webhook secret'],
];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', 'android', 'ios', '.expo', 'dist'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(tsx?|jsx?|json)$/.test(e.name) && !e.name.endsWith('lock.json') ? [p] : [];
  });
}

describe('mobile app bundle', () => {
  it('contains no secrets or server-only settings', () => {
    const hits: string[] = [];
    for (const f of files(ROOT)) {
      const text = fs.readFileSync(f, 'utf8');
      for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${path.relative(ROOT, f)}: ${what}`);
    }
    expect(hits).toEqual([]);
  });
});
