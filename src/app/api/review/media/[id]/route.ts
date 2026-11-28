import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { adminAuditLog, mediaChecks, reports, users } from '@/db/schema';
import { isAuthError, requireModerator } from '@/lib/auth';
import { notFound, parseJsonBody, serverError } from '@/lib/http';
import { createNotification } from '@/lib/notify';
import { refreshReportVerdict, runDeepChecks } from '@/lib/media-integrity';

const actionSchema = z.object({ action: z.enum(['confirm_ai', 'authentic', 'recheck', 'hide']) }).strict();

/**
 * A moderator's decision on a media check:
 *  - confirm_ai: the media is AI-generated. The post is labelled, the poster is told and gets a strike
 *    (once per check).
 *  - authentic:  cleared; the label is removed.
 *  - recheck:    run the deep detectors again.
 *  - hide:       hide the post from everyone.
 * Every decision is written to the audit log.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const mod = await requireModerator();
    if (isAuthError(mod)) return mod;
    const parsed = await parseJsonBody(request, actionSchema);
    if (!parsed.ok) return parsed.response;
    const { action } = parsed.data;
    const { id } = await params;

    const [check] = await db.select().from(mediaChecks).where(eq(mediaChecks.id, id)).limit(1);
    if (!check || !check.reportId) return notFound('Check not found');
    const [report] = await db
      .select({ id: reports.id, submitterId: reports.submitterId, imageUrl: reports.imageUrl, videoUrl: reports.videoUrl })
      .from(reports)
      .where(eq(reports.id, check.reportId))
      .limit(1);
    if (!report) return notFound('Post not found');

    const now = new Date();
    if (action === 'confirm_ai') {
      const firstConfirm = check.reviewDecision !== 'confirmed_ai';
      await db.update(mediaChecks).set({ verdict: 'ai_confirmed', reviewDecision: 'confirmed_ai', reviewedBy: mod.id, reviewedAt: now }).where(eq(mediaChecks.id, id));
      if (firstConfirm) {
        await db.update(users).set({ aiMediaStrikes: sql`${users.aiMediaStrikes} + 1` }).where(eq(users.id, report.submitterId));
        await createNotification({ recipientId: report.submitterId, actorId: null, type: 'media_review', reportId: report.id, metadata: { verdict: 'ai_confirmed', decision: 'confirmed' } });
      }
    } else if (action === 'authentic') {
      const wasConfirmed = check.reviewDecision === 'confirmed_ai';
      await db.update(mediaChecks).set({ verdict: 'likely_authentic', reviewDecision: 'cleared', reviewedBy: mod.id, reviewedAt: now }).where(eq(mediaChecks.id, id));
      // Undo the strike if an earlier review had confirmed it.
      if (wasConfirmed) {
        await db.update(users).set({ aiMediaStrikes: sql`greatest(${users.aiMediaStrikes} - 1, 0)` }).where(eq(users.id, report.submitterId));
      }
    } else if (action === 'recheck') {
      await runDeepChecks(report.id, { imageUrl: report.imageUrl, videoUrl: report.videoUrl });
    } else if (action === 'hide') {
      await db.update(reports).set({ isHidden: true, updatedAt: now }).where(eq(reports.id, report.id));
    }
    const verdict = await refreshReportVerdict(report.id);

    await db.insert(adminAuditLog).values({
      id: crypto.randomUUID(),
      actorId: mod.id,
      action: `media.${action}`,
      targetType: 'report',
      targetId: report.id,
      detailsJson: JSON.stringify({ checkId: id, before: check.verdict, after: verdict }),
      createdAt: now,
    });

    const [updated] = await db.select({ verdict: mediaChecks.verdict, reviewDecision: mediaChecks.reviewDecision }).from(mediaChecks).where(eq(mediaChecks.id, id));
    return NextResponse.json({ ...updated, reportVerdict: verdict });
  } catch (error: unknown) {
    return serverError(error, 'review/media/[id] POST');
  }
}
