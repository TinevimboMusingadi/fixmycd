import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminAuditLog, mediaChecks, notifications, reports, users } from '@/db/schema';
import { POST as upload } from '@/app/api/upload/route';
import { POST as createReport } from '@/app/api/reports/route';
import { GET as getReport } from '@/app/api/reports/[id]/route';
import { GET as mediaQueue } from '@/app/api/review/media/route';
import { POST as decide } from '@/app/api/review/media/[id]/route';
import { POST as captureToken } from '@/app/api/capture-token/route';
import { call } from '../helpers/route';
import { signedInUser } from '../helpers/session';
import { readPhotoFacts } from '@/lib/media-integrity/metadata';

const fixture = (name: string) => fs.readFileSync(path.resolve(__dirname, '../fixtures', name));

const send = (name: string, type: string, extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.append('file', new File([fixture(name)], name, { type }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return call(upload, { method: 'POST', rawBody: form });
};

const post = (imageUrl: string) =>
  call(createReport, { method: 'POST', path: '/api/reports', body: { title: 'Burst water main', latitude: 40.7128, longitude: -74.006, imageUrl } });

describe('media integrity', () => {
  it('warns in real time, labels the post and queues it for review', async () => {
    const poster = await signedInUser('submitter');
    const up = await send('ai-content-credentials.jpg', 'image/jpeg');
    expect(up.status).toBe(200);
    expect(up.json.integrity).toMatchObject({ verdict: 'ai_confirmed' });
    expect(up.json.integrity.reasons[0]).toMatch(/Content Credentials/);
    // Raw facts (GPS, device) are never sent back.
    expect(JSON.stringify(up.json.integrity)).not.toMatch(/signals|facts|gps/i);

    const created = await post(up.json.url);
    expect(created.status).toBe(201);
    expect(created.json.mediaVerdict).toBe('ai_confirmed');
    const detail = await call(getReport, { params: { id: created.json.id } });
    expect(detail.json.mediaVerdict).toBe('ai_confirmed');

    // Moderators see it in the media tab; confirming adds one strike, once.
    const mod = await signedInUser('referee');
    const queue = await call(mediaQueue);
    expect(queue.status).toBe(200);
    const item = queue.json.find((q: { reportId: string }) => q.reportId === created.json.id);
    expect(item).toBeTruthy();
    expect(item.signals.some((s: { conclusive: boolean }) => s.conclusive)).toBe(true);

    expect((await call(decide, { method: 'POST', params: { id: item.id }, body: { action: 'confirm_ai' } })).status).toBe(200);
    expect((await call(decide, { method: 'POST', params: { id: item.id }, body: { action: 'confirm_ai' } })).status).toBe(200);
    const [u] = await db.select({ strikes: users.aiMediaStrikes }).from(users).where(eq(users.id, poster.id));
    expect(u.strikes).toBe(1);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, poster.id));
    expect(notes.filter((n) => n.type === 'media_review')).toHaveLength(1);
    const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.actorId, mod.id));
    expect(audit.map((a) => a.action)).toContain('media.confirm_ai');

    // Clearing it removes the label and the strike.
    await call(decide, { method: 'POST', params: { id: item.id }, body: { action: 'authentic' } });
    const [after] = await db.select({ strikes: users.aiMediaStrikes }).from(users).where(eq(users.id, poster.id));
    expect(after.strikes).toBe(0);
    const [r] = await db.select({ v: reports.mediaVerdict }).from(reports).where(eq(reports.id, created.json.id));
    expect(r.v).toBe('likely_authentic');
  });

  it('strips GPS from stored photos and keeps a real camera photo unflagged', async () => {
    await signedInUser('submitter');
    const up = await send('camera-photo.jpg', 'image/jpeg');
    expect(up.status).toBe(200);
    expect(up.json.integrity.verdict).not.toMatch(/ai/);
    const stored = Buffer.from(up.json.url.split(',')[1], 'base64');
    const facts = await readPhotoFacts(new Uint8Array(stored), 'image/jpeg');
    expect(facts.gps).toBeUndefined();
    expect(facts.make).toBeUndefined();

    const created = await post(up.json.url);
    expect(created.json.mediaVerdict).toBe('likely_authentic');
  });

  it('flags Stable Diffusion PNGs and accepts in-app capture tokens', async () => {
    await signedInUser('submitter');
    expect((await send('stable-diffusion.png', 'image/png')).json.integrity.verdict).toBe('ai_confirmed');

    const token = (await call(captureToken, { method: 'POST' })).json.token;
    const up = await send('photo-with-gps.jpg', 'image/jpeg', { captureToken: token });
    const [check] = await db.select().from(mediaChecks).where(eq(mediaChecks.id, up.json.integrity.checkId));
    expect(JSON.parse(check.signalsJson).facts.capturedInApp).toBe(true);
  });

  it('only moderators can decide, and the verdict follows the file to anyone who posts it', async () => {
    await signedInUser('submitter');
    expect((await call(mediaQueue)).status).toBe(403);
    expect((await call(decide, { method: 'POST', params: { id: 'x' }, body: { action: 'hide' } })).status).toBe(403);

    // Posting someone else's uploaded AI image doesn't dodge the check.
    const up = await send('ai-content-credentials.jpg', 'image/jpeg');
    await signedInUser('submitter');
    const created = await post(up.json.url);
    expect(created.json.mediaVerdict).toBe('ai_confirmed');
  });
});
