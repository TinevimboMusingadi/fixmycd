/**
 * Media integrity: is a posted photo or video real, or AI-generated?
 *
 * 1. At upload (fast, real time): Content Credentials (C2PA), photo metadata and the in-app
 *    capture token are read, a verdict is returned to the poster as a warning, and a
 *    media_checks row is stored. Photos are then stripped of metadata before storage.
 * 2. When the post is created: the post's pin and date are compared with the photo's own,
 *    the post gets a media_verdict (shown as a label) and suspicious media goes to review.
 * 3. After the response: optional deep detectors (Gemini; Google SynthID when available).
 * 4. Reviewers confirm or clear it; a confirmed case adds a strike to the poster's account.
 */
import crypto from 'crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { mediaChecks, reports } from '@/db/schema';
import { c2paSignals, readC2pa, type C2paFacts } from './c2pa';
import { verifyCaptureToken } from './capture';
import { contextSignals, photoSignals, readPhotoFacts, type PhotoFacts } from './metadata';
import { scoreSignals, worstVerdict, type Scored, type Signal, type Verdict } from './score';

export type { Verdict } from './score';

export type MediaFacts = { photo?: PhotoFacts; c2pa?: C2paFacts; capturedInApp?: boolean };

export type StoredEvidence = { facts: MediaFacts; signals: Signal[]; deep?: Record<string, unknown> };

export const urlHash = (url: string) => crypto.createHash('sha256').update(url).digest('hex');

/** Public summary sent to the poster: verdict and plain reasons, never the raw facts. */
export function publicSummary(s: Scored) {
  return { verdict: s.verdict, score: s.score, reasons: s.reasons.slice(0, 3) };
}

export async function fastCheck(input: {
  bytes: Uint8Array;
  mime: string;
  kind: 'image' | 'video' | 'audio';
  userId: string;
  captureToken?: string | null;
}): Promise<{ facts: MediaFacts; scored: Scored }> {
  const facts: MediaFacts = {};
  const signals: Signal[] = [];
  if (input.kind === 'audio') return { facts, scored: scoreSignals([]) };

  facts.c2pa = await readC2pa(input.bytes, input.mime);
  signals.push(...c2paSignals(facts.c2pa));
  if (input.kind === 'image') {
    facts.photo = await readPhotoFacts(input.bytes, input.mime);
    signals.push(...photoSignals(facts.photo));
  }
  facts.capturedInApp = verifyCaptureToken(input.captureToken, input.userId);
  if (facts.capturedInApp) {
    signals.push({ id: 'capture.in_app', weight: -25, reason: 'Captured live with the app’s camera.' });
  }
  return { facts, scored: scoreSignals(signals) };
}

export async function saveUploadCheck(input: {
  userId: string;
  url: string;
  kind: string;
  mime: string;
  facts: MediaFacts;
  scored: Scored;
}): Promise<string> {
  const id = crypto.randomUUID();
  const evidence: StoredEvidence = { facts: input.facts, signals: input.scored.signals };
  await db.insert(mediaChecks).values({
    id,
    userId: input.userId,
    mediaKind: input.kind,
    mime: input.mime,
    urlHash: urlHash(input.url),
    verdict: input.scored.verdict,
    score: input.scored.score,
    signalsJson: JSON.stringify(evidence),
  });
  return id;
}

/** Signals stored on a check, minus earlier context/deep ones (they are recomputed). */
function baseSignals(e: StoredEvidence): Signal[] {
  return e.signals.filter((s) => !s.id.startsWith('ctx.'));
}

/**
 * Links the poster's upload checks to their new post, adds the post-context signals and sets the
 * post's media_verdict. Media that wasn't uploaded through /api/upload has no check (stock images
 * in imports) and is left alone. Returns the post's verdict.
 */
export async function attachChecksToReport(input: {
  reportId: string;
  userId: string;
  urls: (string | null | undefined)[];
  lat?: number | null;
  lng?: number | null;
  occurredAt?: Date | null;
}): Promise<Verdict | null> {
  const hashes = input.urls.filter((u): u is string => !!u).map(urlHash);
  if (!hashes.length) return null;
  // The check follows the file: prefer the poster's own unlinked upload, but a file uploaded by
  // someone else (or already used in another post) brings its evidence along as a copy.
  const all = await db.select().from(mediaChecks).where(inArray(mediaChecks.urlHash, hashes)).orderBy(asc(mediaChecks.createdAt));
  const rows: (typeof all)[number][] = [];
  for (const hash of new Set(hashes)) {
    const own = all.find((r) => r.urlHash === hash && r.userId === input.userId && !r.reportId);
    const any = own ?? all.find((r) => r.urlHash === hash);
    if (!any) continue;
    if (own) rows.push(own);
    else {
      const copy = { ...any, id: crypto.randomUUID(), userId: input.userId, reportId: null, reviewDecision: null, reviewedBy: null, reviewedAt: null, createdAt: new Date() };
      await db.insert(mediaChecks).values(copy);
      rows.push(copy);
    }
  }
  const verdicts: Verdict[] = [];
  for (const row of rows) {
    const evidence = JSON.parse(row.signalsJson) as StoredEvidence;
    const signals = [...baseSignals(evidence)];
    if (evidence.facts.photo) {
      signals.push(...contextSignals(evidence.facts.photo, { lat: input.lat, lng: input.lng, occurredAt: input.occurredAt }));
    }
    const scored = scoreSignals(signals);
    verdicts.push(scored.verdict);
    await db
      .update(mediaChecks)
      .set({ reportId: input.reportId, verdict: scored.verdict, score: scored.score, signalsJson: JSON.stringify({ ...evidence, signals }), checkedAt: new Date() })
      .where(eq(mediaChecks.id, row.id));
  }
  const verdict = worstVerdict(verdicts);
  if (verdict) await db.update(reports).set({ mediaVerdict: verdict }).where(eq(reports.id, input.reportId));
  return verdict;
}

/** Re-scores a check with extra (deep) signals and refreshes its post's verdict. A reviewer's decision always wins. */
export async function applyDeepSignals(checkId: string, detector: string, extra: Signal[], raw: unknown): Promise<Verdict | null> {
  const [row] = await db.select().from(mediaChecks).where(eq(mediaChecks.id, checkId)).limit(1);
  if (!row) return null;
  const evidence = JSON.parse(row.signalsJson) as StoredEvidence;
  const signals = [...evidence.signals.filter((s) => !s.id.startsWith(`deep.${detector}`)), ...extra];
  const scored = scoreSignals(signals);
  const verdict = row.reviewDecision ? (row.verdict as Verdict) : scored.verdict;
  const detectors = Array.from(new Set([...row.detectors.split(','), detector])).join(',');
  await db
    .update(mediaChecks)
    .set({
      verdict,
      score: row.reviewDecision ? row.score : scored.score,
      signalsJson: JSON.stringify({ ...evidence, signals, deep: { ...(evidence.deep ?? {}), [detector]: raw } }),
      detectors,
      checkedAt: new Date(),
    })
    .where(eq(mediaChecks.id, checkId));
  if (row.reportId) await refreshReportVerdict(row.reportId);
  return verdict;
}

export async function refreshReportVerdict(reportId: string): Promise<Verdict | null> {
  const rows = await db.select({ verdict: mediaChecks.verdict }).from(mediaChecks).where(eq(mediaChecks.reportId, reportId));
  const verdict = worstVerdict(rows.map((r) => r.verdict as Verdict));
  await db.update(reports).set({ mediaVerdict: verdict }).where(eq(reports.id, reportId));
  return verdict;
}

export { scoreSignals, worstVerdict } from './score';

const MAX_DEEP_BYTES = 15 * 1024 * 1024;

/** Bytes of a stored upload: an inline data: URL or a file in our own Blob store. */
async function loadStoredMedia(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const { isAllowedMediaUrl } = await import('@/lib/media-url');
  if (url.startsWith('data:')) {
    const m = /^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]*)$/.exec(url);
    if (!m) return null;
    return { mime: m[1], bytes: new Uint8Array(Buffer.from(m[2], 'base64')) };
  }
  if (!isAllowedMediaUrl(url) || !/\.blob\.vercel-storage\.com$/.test(new URL(url).hostname)) return null;
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_DEEP_BYTES) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_DEEP_BYTES) return null;
  return { bytes: buf, mime: (res.headers.get('content-type') ?? '').split(';')[0] };
}

/**
 * Deep checks for a new post's media (run after the response). If they make the post look worse
 * than at posting time, the poster is told and it shows up in the review queue.
 */
export async function runDeepChecks(reportId: string, mediaUrls: Record<string, string | null | undefined>): Promise<void> {
  const { geminiCheck, geminiConfigured } = await import('./deep');
  if (!geminiConfigured()) return;
  const before = (await db.select({ v: reports.mediaVerdict, submitterId: reports.submitterId }).from(reports).where(eq(reports.id, reportId)).limit(1))[0];
  if (!before) return;
  const checks = await db.select().from(mediaChecks).where(eq(mediaChecks.reportId, reportId));
  for (const check of checks) {
    if (check.mediaKind === 'audio' || check.reviewDecision) continue;
    const url = Object.values(mediaUrls).find((u) => u && urlHash(u) === check.urlHash);
    if (!url) continue;
    const media = await loadStoredMedia(url);
    if (!media) continue;
    const result = await geminiCheck(media.bytes, check.mime);
    if (result.error && !result.signals.length) continue;
    await applyDeepSignals(check.id, result.detector, result.signals, result.raw);
  }
  const after = await refreshReportVerdict(reportId);
  const rank = (v: string | null | undefined) => (v === 'ai_confirmed' ? 3 : v === 'suspected_ai' ? 2 : 0);
  if (rank(after) > rank(before.v) && rank(after) >= 2) {
    const { createNotification } = await import('@/lib/notify');
    await createNotification({ recipientId: before.submitterId, actorId: null, type: 'media_review', reportId, metadata: { verdict: after } });
  }
}
